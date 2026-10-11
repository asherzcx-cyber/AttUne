# AttUne

AttUne is a calm, interactive attention-training companion. It combines a visual focus exercise, voluntary camera-based eye tracking, reaction-time tasks, optional EEG input, and spoken coaching to help people practise staying engaged.

AttUne is a training and reflection tool. It is **not** a medical device and does not diagnose ADHD or give medication advice.

## Install AttUne on your phone

Open AttUne in your phone's normal browser:

**https://64.177.52.101.nip.io**

Then save it like an app:

| Device | Installation steps |
| --- | --- |
| iPhone or iPad | Open the link in **Safari** → tap **Share** → **Add to Home Screen** → **Add**. |
| Android | Open the link in **Chrome** → tap the three-dot menu → **Install app** → **Install**. |

An AttUne icon will appear on your home screen. Open it from there whenever you want to train. If you are asked for camera permission during Attention Training, choose **Allow**.

> Tip: Do not open the installation link inside an in-app browser such as Gmail, Instagram, or Discord. Open it in Safari or Chrome instead.

## Getting started

1. Create an AttUne account or sign in.
2. Open **Attention Training** or **Relaxation Training** from the side menu.
3. Find a comfortable, well-lit place and use headphones if you would like to hear guidance privately.
4. Train for a few minutes, then visit **Overview** and **Profile** to see your history.

## Attention Training

Attention Training uses a moving orb, your reaction time, and—when you allow it—camera-based eye tracking.

1. Tap **Begin Training**. AttUne will turn on the camera and prepare eye tracking.
2. Follow the large orb as it travels clockwise or counterclockwise around the screen.
3. When the **orb turns red**, tap the fixed response button as quickly as you can. Do not chase or tap the moving orb.
4. End the session when you are finished. A completed session is saved to your profile.

Your focus estimate combines:

- Response accuracy and reaction time
- How consistently your gaze follows the moving orb
- Optional EEG signal quality and attention estimate

The score is meant to show a training trend, not a judgment of your ability. Lighting, camera angle, tiredness, and calibration can all affect camera-based tracking.

## Relaxation Training

Relaxation Training is for settling down rather than chasing a score.

1. Connect your optional EEG source, if available.
2. Open **Relaxation Training**.
3. Watch the single live EEG waveform—not the orbiting orb—and follow the spoken meditation guidance.
4. End the session when you are ready. Your session can appear in your history and daily training time.

## Connect OpenBCI Cyton + Daisy

EEG is optional. AttUne works with camera and reaction-time training alone, but it can also read a **local** OpenBCI Cyton + Daisy stream to add an experimental EEG estimate to the training display.

### Before you start

You need:

- A Cyton + Daisy, the OpenBCI USB dongle, charged battery, electrodes, and electrode paste or saline setup appropriate for your equipment.
- The latest [OpenBCI GUI](https://openbci.com/downloads) installed on the same Mac or PC that runs AttUne.
- A local AttUne copy with Node.js installed.

Use the hardware only according to OpenBCI's instructions. Check electrode contact and signal quality before beginning. The EEG feature is experimental training feedback, not a diagnosis, medical measurement, or clinical-grade interpretation.

### 1. Start AttUne locally

The OpenBCI GUI sends EEG data to `127.0.0.1`, which means “this same computer.” Open Terminal in the AttUne project and start the local server:

```bash
cd ~/Desktop/AttUne
npm start
```

You should see both of these messages:

```text
AttUne is running at http://localhost:3000
OpenBCI UDP bridge listening on 127.0.0.1:12345
```

Open **http://localhost:3000** on that computer, then sign in to AttUne.

### 2. Connect Cyton + Daisy in OpenBCI GUI

1. Plug in the OpenBCI USB dongle and turn on the Cyton board.
2. For a standard USB-dongle connection, set the Cyton power switch to **PC**.
3. Open OpenBCI GUI and choose the Cyton + Daisy / 16-channel setup that matches your hardware.
4. Select the correct serial port and connect.
5. Confirm that the time-series signal moves and use the GUI's signal-quality or impedance tools to improve poor electrode connections.
6. Start the OpenBCI session/data stream.

If the GUI cannot connect, power-cycle the board, confirm the dongle is connected, and check OpenBCI's [GUI troubleshooting guide](https://docs.openbci.com/Troubleshooting/GUI_Troubleshooting/).

### 3. Add the two GUI widgets

In OpenBCI GUI, open these widgets:

1. **Band Power** — calculates the frequency-band values AttUne uses for its optional EEG estimate.
2. **Networking** — sends that processed data to AttUne.

Keep the Band Power widget open while streaming. In the Networking widget, add or configure a UDP output with these settings:

| Setting | Value |
| --- | --- |
| Protocol | `UDP` |
| Data type | `Average Band Power` (preferred) or `Band Power` |
| IP address / host | `127.0.0.1` |
| Port | `12345` |

Click the Networking widget's **Start** or **Start Stream** button. The exact labels can vary slightly by OpenBCI GUI version. OpenBCI GUI outputs UDP data as JSON, which AttUne listens for on this local port. The GUI's Networking widget is designed for moving data to other applications through UDP, OSC, LSL, or Serial. [OpenBCI GUI overview](https://github.com/OpenBCI/OpenBCI_GUI)

### 4. Confirm AttUne is receiving EEG

Return to AttUne and start Attention Training or Relaxation Training. Within a few seconds, the training header should show **EEG live**.

AttUne first gathers a short personal baseline. During that period, the EEG contribution has limited influence; this is intentional so a sudden raw value does not dominate the score. Once the signal is live, AttUne derives a training-only estimate from relative delta, theta, alpha, and beta band values.

### Relaxation waveform

For the Relaxation Training display, you can add a second UDP output in Networking:

| Setting | Value |
| --- | --- |
| Protocol | `UDP` |
| Data type | `Time Series` / raw time-series output |
| IP address / host | `127.0.0.1` |
| Port | `12345` |

AttUne keeps the latest Channel 1 waveform in memory for the relaxation display. It does not store raw EEG waveform data in the user history database.

### Important: local EEG versus the public phone app

The live app at `https://64.177.52.101.nip.io` runs on a Vultr server. The OpenBCI GUI on your laptop cannot send `127.0.0.1` data to that remote server—`127.0.0.1` always points back to the laptop itself.

For an OpenBCI demo today, use AttUne in the local browser on the same computer as the OpenBCI GUI. The public phone app still supports camera-based training, account history, and the rest of the hosted experience. Sending real-time EEG securely from a local device to the public phone app requires a future authenticated gateway; do not expose UDP port `12345` to the public internet.

### Troubleshooting OpenBCI

| Symptom | What to check |
| --- | --- |
| AttUne says “Waiting for OpenBCI GUI” | Verify `npm start` is running, the GUI protocol is UDP, the host is `127.0.0.1`, port is `12345`, and the Networking stream is started. |
| No Band Power values | Keep the Band Power widget open, make sure the OpenBCI session is running, and select Average Band Power or Band Power in Networking. |
| EEG live appears briefly, then disappears | Check the GUI is still streaming and that no firewall or other app is blocking UDP port `12345`. |
| Relaxation has no waveform | Add the optional Time Series UDP output and leave the data stream running. |
| Signal is noisy | Improve electrode contact, minimize cable motion and electrical interference, and use OpenBCI GUI's signal-quality tools. |

## Your data and privacy

- The camera is used in the browser for eye-tracking during Attention Training. Allow access only when you are comfortable.
- Your account details and completed session summaries are stored so you can view progress and history.
- The Solana completion proof signs a public completion message only. It is not intended to store EEG, eye-tracking, attention, or other health data on-chain.
- Do not use AttUne to make medical decisions. For concerns about attention, medication, or mental health, speak with a qualified healthcare professional.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| Camera will not start | Open AttUne in Safari/Chrome, allow camera permission, and check that another app is not using the camera. |
| Eye tracking seems low | Improve front lighting, face the screen, keep your full face in frame, and sit about an arm's length away. |
| No spoken guidance | Check your phone volume, headphone connection, and browser audio permission. |
| The app takes a moment to open | The hosted demo may need a short moment to wake up after inactivity. |
| EEG is not live | Confirm OpenBCI GUI is running on the same computer and is sending UDP to `127.0.0.1:12345`. |

## Run your own copy

Developers can run AttUne locally with Node.js 22+.

```bash
git clone https://github.com/asherzcx-cyber/AttUne.git
cd AttUne
npm install
cp .env.example .env
npm start
```

Add your own keys and database connection to `.env`. Never commit that file; it is intentionally ignored by Git.

For a hosted deployment, see [`vultr-deploy.md`](vultr-deploy.md). The `Caddyfile` provides the HTTPS configuration required for camera access on mobile devices.
