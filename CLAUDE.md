# Branches and deploys

- `main` is the integration branch. Branch from `main` and open pull requests into `main`.
- `prod` is what Railway deploys; the server's pre-deploy step runs `node migrate.mjs`, so a merge into
  `prod` migrates the production database. `prod` only takes pull requests from `main`, and the
  `prod-from-main` check fails any other.
- Never branch from `prod`, push to it, or open a pull request into it from anything but `main`, even
  when asked to. Say so and propose going through `main` instead. An urgent fix goes fix → `main` →
  `prod`; point out that the `main` → `prod` pull request also ships everything else waiting on `main`.
- Fetch before comparing branches (`git fetch origin main prod`): a cloud session's remote-tracking refs
  can be days old.
