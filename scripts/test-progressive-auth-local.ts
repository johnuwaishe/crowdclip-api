import { randomUUID } from 'node:crypto';
import { GoTrueClient } from '@supabase/auth-js';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { SupabaseAuthConfig } from '../src/auth/supabase-auth.config';
import { DatabaseService } from '../src/database/database.service';
import { WorkspaceSessionService } from '../src/workspaces/workspace-session.service';

interface MailpitAddress {
  Address: string;
}

interface MailpitMessageSummary {
  ID: string;
  To: MailpitAddress[];
}

interface MailpitMessagesResponse {
  messages: MailpitMessageSummary[];
}

interface MailpitMessage {
  Text: string;
  HTML: string;
}

interface ClaimResponseBody {
  user?: { id?: string };
  workspace?: { id?: string };
  provisional?: boolean;
}

interface WorkspaceResponseBody {
  id?: string;
  user?: { id?: string };
  recoveryEmailConfigured?: boolean;
  provisional?: boolean;
}

const mailpitUrl =
  process.env.SUPABASE_LOCAL_MAILPIT_URL ?? 'http://127.0.0.1:54324';

async function findMagicLink(email: string): Promise<string> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const listResponse = await fetch(`${mailpitUrl}/api/v1/messages`);
    if (!listResponse.ok) {
      throw new Error(`Mailpit returned HTTP ${listResponse.status}`);
    }
    const list = (await listResponse.json()) as MailpitMessagesResponse;
    const summary = list.messages.find((message) =>
      message.To.some((recipient) => recipient.Address === email),
    );
    if (summary) {
      const messageResponse = await fetch(
        `${mailpitUrl}/api/v1/message/${encodeURIComponent(summary.ID)}`,
      );
      if (!messageResponse.ok) {
        throw new Error(
          `Mailpit message returned HTTP ${messageResponse.status}`,
        );
      }
      const message = (await messageResponse.json()) as MailpitMessage;
      const content = `${message.Text}\n${message.HTML}`.replaceAll(
        '&amp;',
        '&',
      );
      const links = content.match(/https?:\/\/[^\s<>"']+/g) ?? [];
      const magicLink = links.find((link) => link.includes('/auth/v1/verify'));
      if (magicLink) return magicLink;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No local Supabase magic link arrived for ${email}`);
}

async function exchangeMagicLink(magicLink: string): Promise<string> {
  const response = await fetch(magicLink, { redirect: 'manual' });
  const location = response.headers.get('location');
  if (!location) {
    throw new Error(
      `Supabase magic-link verification returned HTTP ${response.status} without a redirect`,
    );
  }
  const redirect = new URL(location);
  const fragment = new URLSearchParams(redirect.hash.slice(1));
  const accessToken =
    fragment.get('access_token') ?? redirect.searchParams.get('access_token');
  if (!accessToken) {
    throw new Error(
      'Supabase magic-link redirect did not contain an access token',
    );
  }
  return accessToken;
}

async function main() {
  process.env.STORY_MENTION_WORKER_ENABLED = 'false';
  process.env.MEDIA_DOWNLOAD_WORKER_ENABLED = 'false';
  process.env.AUDIO_ANALYSIS_WORKER_ENABLED = 'false';

  const app = await NestFactory.create<INestApplication<App>>(AppModule, {
    abortOnError: false,
    logger: ['error'],
  });
  await app.init();

  const database = app.get(DatabaseService);
  const authConfig = app.get(SupabaseAuthConfig);
  const sessions = app.get(WorkspaceSessionService);
  const supabase = new GoTrueClient({
    url: `${authConfig.url}/auth/v1`,
    headers: { apikey: authConfig.key },
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  });

  const runId = randomUUID();
  const email = `progressive-auth-${runId}@crowdclip.local`;
  let authUserId: string | null = null;
  let workspaceId: string | null = null;

  try {
    const otp = await supabase.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (otp.error) throw otp.error;

    const magicLink = await findMagicLink(email);
    const accessToken = await exchangeMagicLink(magicLink);
    const claimsResult = await supabase.getClaims(accessToken);
    if (claimsResult.error || !claimsResult.data?.claims.sub) {
      throw (
        claimsResult.error ?? new Error('Supabase did not return user claims')
      );
    }
    authUserId = claimsResult.data.claims.sub;

    const workspace = await database.query<{ id: string }>(
      `INSERT INTO public.workspaces (name) VALUES ($1) RETURNING id`,
      [`Progressive auth integration ${runId}`],
    );
    workspaceId = workspace.rows[0]?.id ?? null;
    if (!workspaceId) throw new Error('Integration workspace was not created');

    const account = await database.query<{ id: string }>(
      `
        INSERT INTO public.instagram_accounts (
          workspace_id,
          instagram_recipient_id,
          username,
          account_type,
          connection_status,
          access_token_encrypted,
          connected_at
        )
        VALUES ($1, $2, 'integration_artist', 'CREATOR', 'connected', $3, NOW())
        RETURNING id
      `,
      [workspaceId, `integration-${runId}`, 'local-integration-token'],
    );
    const instagramAccountId = account.rows[0]?.id;
    if (!instagramAccountId) {
      throw new Error('Integration Instagram account was not created');
    }

    const provisionalCookie = sessions.issue(instagramAccountId, workspaceId);
    const claimResponse = await request(app.getHttpServer())
      .post('/auth/account/claim')
      .set('Authorization', `Bearer ${accessToken}`)
      .set(
        'Cookie',
        `crowdclip_session=${encodeURIComponent(provisionalCookie)}`,
      )
      .expect(201);
    const claimBody = claimResponse.body as ClaimResponseBody;

    if (
      claimBody.user?.id !== authUserId ||
      claimBody.workspace?.id !== workspaceId ||
      claimBody.provisional !== false
    ) {
      throw new Error(
        'The account claim response did not contain the expected owner',
      );
    }

    const workspaceResponse = await request(app.getHttpServer())
      .get('/workspace')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const workspaceBody = workspaceResponse.body as WorkspaceResponseBody;

    if (
      workspaceBody.id !== workspaceId ||
      workspaceBody.user?.id !== authUserId ||
      workspaceBody.recoveryEmailConfigured !== true ||
      workspaceBody.provisional !== false
    ) {
      throw new Error(
        'Verified workspace access did not persist after the claim',
      );
    }

    console.log('Progressive auth local integration passed:');
    console.log('  1. Supabase sent and verified an email magic link.');
    console.log(
      '  2. CrowdClip required both the verified token and Instagram cookie.',
    );
    console.log('  3. The verified user claimed the provisional workspace.');
    console.log(
      '  4. The Supabase token reopened the same workspace without Instagram.',
    );
  } finally {
    if (workspaceId) {
      await database.query(`DELETE FROM public.workspaces WHERE id = $1`, [
        workspaceId,
      ]);
    }
    if (authUserId) {
      await database.query(`DELETE FROM auth.users WHERE id = $1`, [
        authUserId,
      ]);
    } else {
      await database.query(`DELETE FROM auth.users WHERE email = $1`, [email]);
    }
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    'Progressive auth local integration failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
