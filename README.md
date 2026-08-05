<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

CrowdClip is a NestJS API that receives Instagram webhook events, creates fan,
clip, and media records in PostgreSQL, and copies temporary Instagram story
media into private Supabase Storage.

## Project setup

```bash
$ pnpm install
```

## Local development

Docker Desktop must be running because the Supabase CLI uses Docker for the
local database and Storage services.

Start the local Supabase stack:

```bash
$ pnpm exec supabase start
```

Then start the API and both background workers:

```bash
$ pnpm start:local
```

`start:local` runs [`scripts/start-local.zsh`](./scripts/start-local.zsh). The
script reads the local API URL and service-role key from
`pnpm exec supabase status -o env`, exposes them to the Nest process as
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and then starts the development
server. It does not print the credentials or save them to a file, and they
disappear when the process stops.

The local Supabase URL is normally `http://127.0.0.1:54321`; its port is
configured in [`supabase/config.toml`](./supabase/config.toml). The URL is
discovered at startup rather than copied into `.env.local`.

## API documentation

With the API running, open the interactive Swagger documentation at:

```text
http://localhost:3000/docs
```

The generated OpenAPI JSON document is available at:

```text
http://localhost:3000/docs-json
```

Protected workspace endpoints accept either a verified Supabase Bearer token
or the provisional `crowdclip_session` cookie issued by Instagram OAuth. The
account-claim endpoint requires both credentials.

For a hosted environment, set `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` using the hosting provider's secret manager. Never
commit the service-role key.

## Clip review API

List the newest clips for artist review:

```bash
$ curl "http://localhost:3000/clips?limit=20"
```

`limit` defaults to `20` and must be between `1` and `100`. The response
includes the fan, the current media choice, and every media asset belonging to
the clip. Stored assets receive a signed preview URL that expires after five
minutes by default. Temporary Instagram CDN URLs, permanent Storage paths, and
worker errors are not exposed.

This MVP endpoint assumes one connected Instagram account and does not yet have
artist authentication. Add authentication before exposing it publicly.

Record the artist's decision after reviewing a clip:

```bash
$ curl --request PATCH \
  --header "Content-Type: application/json" \
  --data '{"mediaChoice":"use_instagram_story"}' \
  "http://localhost:3000/clips/<clip-id>/media-choice"
```

Use `request_fan_original` instead to create an original-file request. That
response contains an `uploadPath` for the upcoming fan upload flow. CrowdClip
persists only its SHA-256 hash; the signed raw token can be reproduced from the
request ID and expiry for safe delivery retries. Repeating the same decision
returns the same unexpired path. Attempting to change an existing decision
returns `409`.

Set `ORIGINAL_FILE_UPLOAD_TOKEN_SECRET` to a secret containing at least 32
bytes. It signs original-file upload links and must remain stable across
deployments.

Choosing `use_instagram_story` requires the Instagram asset to have reached
`stored`. Automatic Instagram messaging and the fan upload endpoint are the
next phases; the returned upload path does not accept uploads yet.

## Compile and run the project

```bash
# recommended local development (API plus both workers)
$ pnpm start:local

# API without automatic local Storage credentials
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov

# database migration tests against local Supabase
$ pnpm run test:db
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
