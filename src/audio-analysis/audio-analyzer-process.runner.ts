import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';

const MAX_PROCESS_OUTPUT_BYTES = 1_000_000;

export interface AudioAnalyzerProcessInput {
  command: string;
  args: string[];
  cwd: string;
  stdin: string;
  timeoutMs: number;
}

export interface AudioAnalyzerProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

@Injectable()
export class AudioAnalyzerProcessRunner {
  run(input: AudioAnalyzerProcessInput): Promise<AudioAnalyzerProcessResult> {
    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(input.command, input.args, {
        cwd: input.cwd,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const settle = (callback: () => void, timeout: NodeJS.Timeout): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback();
      };

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        settle(
          () =>
            rejectPromise(
              new Error(`Audio analyser timed out after ${input.timeoutMs}ms`),
            ),
          timeout,
        );
      }, input.timeoutMs);
      timeout.unref();

      const append = (current: string, chunk: Buffer): string => {
        const next = current + chunk.toString('utf8');
        if (Buffer.byteLength(next) > MAX_PROCESS_OUTPUT_BYTES) {
          child.kill('SIGKILL');
          settle(
            () =>
              rejectPromise(new Error('Audio analyser output was too large')),
            timeout,
          );
        }
        return next;
      };

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = append(stdout, chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = append(stderr, chunk);
      });
      child.on('error', (error) => {
        settle(() => rejectPromise(error), timeout);
      });
      child.on('close', (exitCode) => {
        settle(
          () =>
            resolvePromise({
              exitCode: exitCode ?? -1,
              stdout,
              stderr,
            }),
          timeout,
        );
      });

      child.stdin.end(input.stdin);
    });
  }
}
