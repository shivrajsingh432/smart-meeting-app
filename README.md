# 🚀 SmartMeet – AI-Powered Video Conferencing App

A production-ready, full-stack video conferencing app with real-time WebRTC, Socket.io signaling, Hugging Face AI (transcription + summarization), and live engagement analytics.

---

## 📁 Project Structure

```
VideoCall/
├── server/                   # Backend (Node.js + Express + Socket.io)
│   ├── config/db.js          # MongoDB connection
│   ├── models/               # Mongoose models (User, Meeting, Transcript, Engagement)
│   ├── controllers/          # Route handlers
│   ├── routes/               # Express routes
│   ├── services/             # Hugging Face AI service
│   ├── socket/index.js       # Socket.io signaling server
│   ├── middleware/           # JWT auth + file upload
│   ├── server.js             # Main entry point
│   ├── .env                  # 🔑 Fill in your API keys here
│   └── .env.example          # Template
└── public/                   # Frontend (HTML + CSS + Vanilla JS)
    ├── index.html            # Landing page
    ├── login.html            # Login
    ├── register.html         # Register
    ├── meeting.html          # Meeting room
    ├── dashboard.html        # User dashboard
    ├── summary.html          # Post-meeting analytics
    ├── css/                  # Stylesheets
    └── js/                   # JavaScript modules
```

---

## ⚡ Quick Start

### 1. Prerequisites
- **Node.js** v18+ – [Download](https://nodejs.org)
- **MongoDB Atlas** account (free) – [Register](https://mongodb.com/atlas)
- **Hugging Face** account (free) – [Register](https://huggingface.co)

### 2. Install Dependencies

```bash
cd "C:\Users\SHIVRAJ SINGH\VideoCall\server"
npm install
```

### 3. Configure Environment Variables

Open `server/.env` and fill in:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/smartmeeting
JWT_SECRET=any_random_secret_string
HUGGINGFACE_API_KEY=hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Getting your keys:**
- **MongoDB URI**: Create a free cluster at [mongodb.com/atlas](https://mongodb.com/atlas) → Connect → Drivers → copy URI
- **HF API Key**: [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) → New Token → Read

### 4. Start the Server

```bash
cd "C:\Users\SHIVRAJ SINGH\VideoCall\server"
npm start
```

Server runs at: **http://localhost:5000**

---

## 🎯 Features

| Feature | Technology |
|---------|-----------|
| Video Calls | WebRTC + Socket.io |
| Real-time Signaling | Socket.io |
| AI Transcription | Hugging Face Whisper (`openai/whisper-large-v3`) |
| AI Summarization | Hugging Face BART (`facebook/bart-large-cnn`) |
| Live Transcript | Web Speech API |
| Engagement Score | AudioContext amplitude + formula |
| Contribution Chart | Chart.js Doughnut |
| Authentication | JWT + bcrypt |
| Database | MongoDB + Mongoose |
| PDF Export | jsPDF |

---

## 🔌 API Reference

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | No | Register new user |
| POST | `/api/auth/login` | No | Login, get JWT |
| GET | `/api/auth/me` | Yes | Get current user |

### Meetings
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/meetings/create` | Yes | Create meeting |
| POST | `/api/meetings/join` | Yes | Join meeting |
| POST | `/api/meetings/:id/end` | Yes (host) | End meeting + generate summary |
| GET | `/api/meetings/history` | Yes | Get meeting history |
| GET | `/api/meetings/:id/summary` | Yes | Get summary + analytics |

### AI / Transcript
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/transcribe` | Yes | Upload audio → Whisper |
| POST | `/api/transcribe/text` | Yes | Save Web Speech API text |
| POST | `/api/transcribe/generate-summary` | Yes (host) | Generate AI summary |

### Engagement
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/engagement/update` | Yes | Update engagement metrics |
| GET | `/api/engagement/:meetingId` | Yes | Get engagement scores |
| GET | `/api/engagement/:meetingId/leaderboard` | Yes | Get contribution leaderboard |

---

## 🔌 Socket.io Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `join-room` | `{ meetingId }` | Join meeting room |
| `offer` | `{ targetSocketId, offer }` | WebRTC offer |
| `answer` | `{ targetSocketId, answer }` | WebRTC answer |
| `ice-candidate` | `{ targetSocketId, candidate }` | ICE candidate |
| `chat-message` | `{ meetingId, message }` | Send chat |
| `raise-hand` | `{ meetingId, raised }` | Raise/lower hand |
| `toggle-audio` | `{ meetingId, isMuted }` | Mute/unmute |
| `toggle-video` | `{ meetingId, isCameraOn }` | Camera toggle |
| `speaking` | `{ meetingId, isSpeaking }` | Active speaker |
| `screen-share-started` | `{ meetingId }` | Start screen share |
| `engagement-update` | `{ meetingId, speakingTimeDelta, cameraOnTimeDelta }` | Sync engagement |
| `end-meeting` | `{ meetingId }` | End meeting for all |
| `leave-room` | `{ meetingId }` | Leave room |

---

## ☁️ Deployment

### Render.com (Recommended, Free)

1. Push to GitHub
2. Create new **Web Service** on [render.com](https://render.com)
3. Build: `cd server && npm install`
4. Start: `node server/server.js`
5. Add Environment Variables in Render dashboard

### Railway
1. `railway init` in project root
2. Add `server/.env` values as Railway env vars
3. `railway up`

---

## 🛠️ Development

```bash
# Install nodemon for auto-restart
npm install -g nodemon

# Dev mode
cd server && nodemon server.js
```

---

## 📝 Notes

- The app works **without** Hugging Face keys – AI features will show placeholder messages
- WebRTC works peer-to-peer; for production with many users, add a TURN server
- Speech recognition uses Web Speech API (Chrome/Edge best supported)
