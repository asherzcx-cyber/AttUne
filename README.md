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

## Optional EEG connection

AttUne can accept a local OpenBCI Cyton + Daisy demo stream through the OpenBCI GUI. EEG is optional; the attention exercise can still run with the camera and reaction task.

For the OpenBCI demo, run the OpenBCI GUI and AttUne on the **same computer**. In the GUI's Networking widget, send **Average Band Power** or **Band Power** over UDP to:

```text
IP address: 127.0.0.1
Port: 12345
```

AttUne will show EEG as live after it receives data and builds a short baseline. A phone connected to the public app cannot directly receive the local OpenBCI GUI stream.

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
