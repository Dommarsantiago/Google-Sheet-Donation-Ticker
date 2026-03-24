# Google-Sheet-Donation-Ticker

Add a donation ticker to any broadcast by connecting a simple Google Sheets document with this locally run process. The final output (via HTML) can be added to OBS or other streaming software.

## Run locally

1. Install [Node.js](https://nodejs.org/) if needed.
2. In this folder: `npm install`
3. Start the server: `npm start` (default port **3000**, or set `PORT` in the environment).
4. Open **Control**: [http://localhost:3000/](http://localhost:3000/) — set **Spreadsheet ID**, **Tab ID (gid)**, and other options. You can paste a full Google Sheet link in the optional field; when you leave that field, it fills ID and tab.
5. Open **Ticker** for OBS/browser source: [http://localhost:3000/ticker](http://localhost:3000/ticker) (add `?test=1` to preview with sample data).

The sheet must be shared so anyone with the link can view it (or use a published CSV export URL). Settings are stored in `config.json` next to `server.js` when you run from source, or **next to `donation-ticker.exe`** when you use the packaged build below.

## Run at startup (Windows)

Windows needs a wrapper (service, scheduled task, or PM2) to start the app automatically. Use either **Node + `server.js`** (from [Run locally](#run-locally)) or **`donation-ticker.exe`** ([Windows executable](#windows-executable-exe)) as the program.

### Option A: NSSM (recommended — real Windows service)

[NSSM](https://nssm.cc/) runs any program as a service with restart and logging options.

1. Download NSSM and extract it (use the build matching your OS: 64-bit vs 32-bit).
2. From an **elevated** Command Prompt or PowerShell, install the service (adjust paths):

   ```text
   nssm install DonationTicker
   ```

3. In the NSSM GUI (or via `nssm set`):

   **If using the .exe**

   - **Path**: full path to `donation-ticker.exe` (e.g. `C:\Program Files\DonationTicker\donation-ticker.exe`).
   - **Startup directory**: the **same folder** as the `.exe` (so `config.json` is found).
   - **Arguments**: leave empty.

   **If using Node from the project folder**

   - **Path**: full path to `node.exe` (e.g. `C:\Program Files\nodejs\node.exe`).
   - **Startup directory**: folder containing this project (where `server.js` lives).
   - **Arguments**: `server.js` (or the full path to `server.js`).

4. Optionally add environment variable `PORT` if you do not want port 3000.
5. Start the service: `nssm start DonationTicker` or from **Services** (`services.msc`).

Use full paths if `node` is not on the system PATH for the service account.

### Option B: Task Scheduler (no extra software)

1. Open **Task Scheduler** → **Create Task**.
2. **General**: name e.g. `DonationTicker`; choose “Run whether user is logged on or not” if you want it at boot without a login.
3. **Triggers**: **At startup** (or **At log on**).
4. **Actions** → **Start a program**:

   **If using the .exe**

   - **Program/script**: full path to `donation-ticker.exe`
   - **Start in**: folder containing the `.exe`

   **If using Node**

   - **Program**: `cmd.exe`
   - **Arguments**: `/c cd /d "C:\path\to\Google-Sheet-Donation-Ticker" && node server.js`

5. Save and enter credentials if prompted.

If OBS or another machine loads the ticker over the network, ensure Windows Firewall allows inbound TCP on your chosen port.

### Option C: PM2

If you already use PM2:

**From source**

```text
cd C:\path\to\Google-Sheet-Donation-Ticker
pm2 start server.js --name donation-ticker
pm2 save
pm2 startup
```

**From the .exe**

```text
pm2 start C:\path\to\donation-ticker.exe --name donation-ticker --interpreter none
pm2 save
pm2 startup
```

Follow the command PM2 prints to enable startup.
