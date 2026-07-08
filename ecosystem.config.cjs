// PM2 process definitions for Life OS in production.
//
// Two long-running processes are needed, exactly like `npm run dev` locally:
//   1. the Next.js server (serves the built app)
//   2. the reminder worker (node-cron: pings + morning summary)
//
// Run from the repo root, AFTER `npm run build`:
//   pm2 start ecosystem.config.cjs
//   pm2 save          # remember this process list across reboots
//   pm2 startup       # then run the one sudo line it prints
//
// `cwd: __dirname` pins each process to this folder so `.env` and the
// SQLite file at data/lifeos.db resolve the same way they do in dev.

module.exports = {
  apps: [
    {
      name: "life-os-web",
      // `next start` serves the production build. NODE_ENV=production makes the
      // session cookie Secure and the passcode/secret gates fail closed.
      script: "npm",
      args: "run start:web",
      cwd: __dirname,
      env: { NODE_ENV: "production" },
      autorestart: true,
    },
    {
      name: "life-os-worker",
      // The reminder/summary cron, run through tsx. Without this process the
      // app still works, but no pings or morning summaries fire.
      script: "npm",
      args: "run start:worker",
      cwd: __dirname,
      env: { NODE_ENV: "production" },
      autorestart: true,
    },
  ],
};
