# claudeui ♥

A custom chat UI for Claude with interchangeable themes, powered by your
**existing Claude account** — no API key. Ships with a cute **pink retro**
pixel-windows theme and a **green terminal** theme.

Under the hood it uses the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk),
which runs Claude locally with the same kind of subscription login the Claude
desktop app uses.

## Setup

```sh
npm install
npm run login    # one-time: sign in with your Claude account (browser opens)
npm start        # then open http://localhost:3000
```

`npm run login` launches the Claude runtime bundled with the SDK — pick
**Claude account (subscription)** and sign in with the same account you use in
the Claude desktop app, then type `/exit`. That's it; the login is remembered.

Optional environment variables:

| Variable | Default | What it does |
|---|---|---|
| `CLAUDE_MODEL` | your Claude default | Model override (e.g. `opus`, `sonnet`) |
| `PORT` | `3000` | Server port |

## How it works

- `server.js` — tiny Node server (no framework). Serves the frontend and
  exposes `POST /api/chat`, which streams Claude's reply as server-sent events
  via the Agent SDK. Conversations are real sessions (the server remembers the
  thread; **File → New Chat** starts fresh). All built-in tools are disabled —
  it's a pure chat.
- `public/base.css` — all layout and structure, written entirely against CSS
  custom properties. It never hardcodes a look.
- `public/themes/<id>/theme.css` — each theme overrides those variables
  (colors, fonts, `--window-title`, decorations) and can add extras
  (scanlines, hearts, glow…). Even the mouse cursor is themeable:
  `--cursor-default`, `--cursor-pointer`, and `--cursor-text` take inline-SVG
  pixel-art cursors (see the pink theme for examples).
- `public/themes/themes.json` — the theme registry. The Theme menu is built
  from it, and your pick is remembered in `localStorage`.

## Adding a new theme

1. Create `public/themes/<your-theme-id>/theme.css`.
2. Override whatever CSS variables you want (see the `:root` block in
   `base.css` for the full list). Anything you skip falls back to a neutral
   default.
3. Optionally add theme-only flourishes — extra selectors apply on top of the
   base (the pink theme turns the typing dots into hearts; the terminal theme
   adds CRT scanlines).
4. Register it in `public/themes/themes.json`:

   ```json
   { "id": "your-theme-id", "name": "your theme name" }
   ```

That's it — it appears in the **Theme** menu immediately. No JS changes.

## UI extras

- **File → New Chat / Export Chat…** — reset the conversation or download it as `.txt`
- **Theme →** switch themes live
- Title bar − / □ collapse and maximize the window; ✕ just wiggles (nice try ♥)
- `Enter` sends, `Shift+Enter` for a newline
- Status bar shows model, token usage, and current theme

## Bonus: the claude.ai wrapper

`wrapper/` contains a different take on the same idea — an Electron desktop
app that embeds the **real claude.ai** (your chat history, artifacts, projects)
inside the pink pixel window frame, reskinning the site itself with injected
CSS. Same theme system, two stylesheets per theme (`chrome.css` for the frame,
`claude.css` for the site). Run it with:

```sh
cd wrapper
npm install
npm start
```
