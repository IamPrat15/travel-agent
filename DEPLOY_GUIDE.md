# Step-by-step deploy guide (for non-technical users)

This guide assumes you've never used Git, GitHub, or Render before. It will take **45–60 minutes total**, mostly waiting for builds. Have a cup of tea ready.

## What you'll need

- The `travel-agent` folder I gave you (extracted from the download)
- A computer with internet
- An email address
- (Optional) An Anthropic API key — without it, the app uses a regex fallback parser that works fine for demo sentences

## What this will cost

**₹0 for the first 30 days.** After that:

- GitHub: free forever
- Render web services (frontend + backend): **free forever** (they sleep after 15 minutes idle and take ~60 seconds to wake on the next request)
- Render Postgres database: **free for 30 days, then auto-deleted** (with a 14-day grace period to upgrade to $7/month)
- Anthropic API: pay-as-you-go, typically ₹1–5 per request — only if you choose to use it

For a demo you show internally for a few weeks, ₹0. For anything you want to keep alive past 30 days, **$7/month** (~₹600/month) for the database.

---

# Part 1: Install the tools you need (one-time, ~10 minutes)

## 1.1 Install Git

Git is what uploads your code to GitHub.

- **Windows**: Go to https://git-scm.com/download/win and download. Run the installer. Click "Next" on every screen — defaults are fine.
- **Mac**: Open the Terminal app (Cmd+Space, type "Terminal"). Type `git --version` and press Enter. If it asks to install developer tools, click Install. Wait for it to finish.

To check it worked: open Terminal (Mac) or Git Bash (Windows, search for it in the Start menu), type `git --version`, press Enter. You should see something like `git version 2.45.0`.

## 1.2 Create a GitHub account

GitHub stores your code online and is what Render reads from.

1. Go to https://github.com/signup
2. Sign up with your email. Pick a username (this becomes part of your repo URL).
3. Verify your email when GitHub sends you the link.

## 1.3 Create a Render account

1. Go to https://render.com
2. Click **Get Started** (top right)
3. Sign up using your GitHub account — click **GitHub** when given the option. This makes Step 4 below much easier.
4. Fill in the basics. **No credit card needed for the free tier.**

---

# Part 2: Put the code on GitHub (~10 minutes)

## 2.1 Create a new repository on GitHub

1. Log into https://github.com
2. Click the **+** in the top-right corner → **New repository**
3. Repository name: `travel-agent` (or anything you like)
4. Set it to **Private** (only you can see it). Public also works.
5. **Important: Do NOT check** "Add a README file", "Add .gitignore", or "Choose a license". Leave them all unchecked. We're uploading our own files.
6. Click **Create repository**

GitHub now shows you a page with some commands. Keep this tab open — we'll come back to it.

## 2.2 Open a terminal in the project folder

You need to navigate to wherever you saved the `travel-agent` folder.

- **Windows**: Open File Explorer, find the `travel-agent` folder, right-click on it, and select **Git Bash Here** (or **Open in Terminal**).
- **Mac**: Open Terminal. Type `cd ` (with a space after it), then drag the `travel-agent` folder from Finder into the Terminal window. The path gets pasted automatically. Press Enter.

To check you're in the right place, type `ls` (Mac) or `dir` (Windows) and press Enter. You should see `apps`, `package.json`, `render.yaml`, `README.md` listed.

## 2.3 Tell Git who you are (one-time setup)

In the terminal, run these two commands, replacing the values with your own:

```bash
git config --global user.email "your-email@example.com"
git config --global user.name "Your Name"
```

These show up next to your code commits. Use the same email you used for GitHub.

## 2.4 Upload the code to GitHub

Still in the terminal, in the `travel-agent` folder, run these commands one at a time. Copy each line, paste it, press Enter, wait for it to finish, then do the next:

```bash
git init
```
(Creates an empty Git project in this folder.)

```bash
git add .
```
(Stages every file for upload. The dot means "everything in this folder".)

```bash
git commit -m "Initial commit"
```
(Saves a snapshot of your code with a message.)

```bash
git branch -M main
```
(Renames the default branch to "main" — Render expects this.)

Now go back to the GitHub tab from step 2.1. You'll see a section titled **"…or push an existing repository from the command line"**. Copy the two lines from there. They'll look like:

```bash
git remote add origin https://github.com/YOUR-USERNAME/travel-agent.git
git push -u origin main
```

Run them one at a time in the terminal.

When you run `git push`, GitHub will ask you to log in. Two ways this might go:
- **A browser window opens** asking you to authorize Git. Click yes. Done.
- **It asks for username and password in the terminal.** GitHub doesn't accept your password here anymore — you need a "personal access token" instead. If this happens:
  1. Go to https://github.com/settings/tokens
  2. Click **Generate new token (classic)**
  3. Note: "Git CLI". Expiration: 90 days. Scope: check **repo**.
  4. Click Generate. **Copy the token immediately** (you won't see it again).
  5. Paste the token where the terminal asks for password.

Refresh your GitHub repo page. You should see all your files there. If yes, you're done with Part 2.

---

# Part 3: Deploy to Render (~20 minutes)

## 3.1 Create the Blueprint

1. Log into https://render.com
2. In the dashboard, click **New** (top right) → **Blueprint**
3. **Connect a repository**: if you signed up with GitHub, your repos appear automatically. Find `travel-agent` and click **Connect**.
   - If you don't see it, click **Configure GitHub App** and grant Render access to your `travel-agent` repo specifically.
4. Render reads `render.yaml` from your repo and shows three services:
   - `travel-agent-db` (PostgreSQL database)
   - `travel-agent-api` (backend)
   - `travel-agent-web` (frontend)
5. Give the Blueprint a name like "Travel Agent". Click **Apply**.

Render now starts building. You'll see them go through "Building" → "Live" status. This takes **5–8 minutes** the first time. Grab that tea.

## 3.2 Watch the builds (and what to do if one fails)

You can watch each service's build live:

1. Click on `travel-agent-api` from the Blueprint page
2. Click the **Logs** tab on the left

If a build fails, the logs show why. The most likely first-deploy error is:
- **Backend fails saying "DATABASE_URL is missing"** — this means the database wasn't ready in time. Just click **Manual Deploy** → **Deploy latest commit** at the top right and it'll work the second time.

Once `travel-agent-api` shows **Live** with a green dot, click on it. At the top of the page, you'll see a URL like `https://travel-agent-api-xyz.onrender.com`. **Copy this URL — you need it next.**

## 3.3 Set the environment variables (the one tricky bit)

Two services need to know each other's URLs. Render didn't know these URLs in advance, so we set them now.

### On `travel-agent-web`:

1. From the Blueprint, click `travel-agent-web`
2. Click **Environment** on the left sidebar
3. You'll see `VITE_API_URL` listed with no value
4. Click **Edit** → paste the **API URL** you copied (e.g., `https://travel-agent-api-xyz.onrender.com`). **No trailing slash**.
5. Click **Save Changes**
6. Render will prompt to redeploy — click **Save and Deploy**

While that's deploying, go to the API and copy ITS web service URL the same way. Click on `travel-agent-web`, copy its URL.

### On `travel-agent-api`:

1. From the Blueprint, click `travel-agent-api`
2. Click **Environment** on the left
3. You'll see `CORS_ORIGIN` and `ANTHROPIC_API_KEY` both empty
4. Click **Edit** next to `CORS_ORIGIN` and paste the **WEB URL** (e.g., `https://travel-agent-web-abc.onrender.com`). No trailing slash.
5. (Optional) If you have an Anthropic API key, paste it next to `ANTHROPIC_API_KEY`. If you don't, leave it blank — the regex parser kicks in automatically.
6. Click **Save Changes** → **Save and Deploy**

Both services will now redeploy (~3 minutes each).

## 3.4 Test it

Once both show **Live** again:

1. Open your **web URL** in a browser
2. You'll see the Travel Request Agent home page
3. The employee dropdown should show 3 names (Priya, Arjun, Neha)
4. Pick Priya, leave the default text, click **Submit**
5. After 1–2 seconds (longer on the very first request because of cold start) you'll see the proposal: a road trip to Pune, 4-star hotel, ₹18,500 total

**If the dropdown is empty or you see an error:**
- Open your browser's developer tools (F12 in Chrome). Look at the **Console** tab.
- If you see a "CORS" error: the `CORS_ORIGIN` value on the API doesn't match the web URL exactly. Recheck for trailing slashes and copy-paste typos.
- If you see "Network error" or "Failed to fetch": the `VITE_API_URL` value is wrong. Same fix — check for typos.

---

# Part 4: Get an Anthropic API key (optional, ~5 minutes)

Without this, the app uses a regex parser that handles the three sample sentences fine. If you want it to handle wider phrasing variety, get a key.

1. Go to https://console.anthropic.com
2. Sign up (free, but you'll need a credit card for any actual usage)
3. Add ₹1,000 (~$12) of credit. This is the only paid item in this whole guide.
4. Go to **Settings** → **API Keys** → **Create Key**
5. Name it "Travel Agent" → Create → **copy the key immediately** (starts with `sk-ant-...`)
6. Paste it into Render: `travel-agent-api` → Environment → `ANTHROPIC_API_KEY` → Save and Deploy

A typical request costs ₹1–5. Your ₹1,000 buys hundreds of test requests.

---

# Cheat sheet: when something breaks

| Symptom | Most likely cause | Fix |
|---|---|---|
| Web URL shows blank/error page | Frontend deploy failed or env var wrong | Check `travel-agent-web` Logs tab |
| First page load takes 60+ seconds | Cold start (free tier sleeping) | Normal — second load is instant |
| "CORS error" in browser console | `CORS_ORIGIN` wrong on API | Re-paste web URL, no trailing slash, redeploy |
| "Failed to fetch" / dropdown empty | `VITE_API_URL` wrong on web | Re-paste API URL, no trailing slash, redeploy |
| API logs say "Cannot connect to database" | DB still starting | Click Manual Deploy on the API |
| Everything broke after 30 days | Free database expired | Either upgrade DB to $7/mo or delete the DB and create a new one (loses data) |

---

# Updating the app later

When you change code (or I send you updated files):

1. Replace the files in your `travel-agent` folder
2. In your terminal, in that folder:
   ```bash
   git add .
   git commit -m "Update XYZ"
   git push
   ```
3. Render auto-detects the push and redeploys both services. No manual step needed.

That's it. You now know enough Git to maintain this app indefinitely.
