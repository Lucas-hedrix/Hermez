# Cupid — React Native + Firebase

## Stack
- **Frontend**: React Native (Expo ~54)
- **Auth**: Firebase Authentication (Email/Password + Google)
- **Database**: Cloud Firestore
- **Storage**: Firebase Storage (profile photos)
- **Navigation**: React Navigation v6

---

## Quick Start

```bash
npm install
npx expo start
# Scan QR with Expo Go app
```

---

## Project Structure

```
spark-app/
├── App.jsx                        ← Entry point
├── src/
│   ├── firebase/
│   │   └── config.js              ← Firebase init (fill in your credentials)
│   ├── theme/
│   │   └── index.js               ← Colors, fonts, spacing, shadows
│   ├── components/
│   │   └── UI.js                  ← PrimaryButton, InputField, Avatar, etc.
│   ├── navigation/
│   │   └── AppNavigator.jsx       ← Screen routing + tab bar
│   └── screens/
│       ├── WelcomeScreen.jsx      ← Landing / splash
│       ├── LoginScreen.jsx        ← Email + Google sign-in
│       ├── RegisterScreen.jsx     ← Email + Google sign-up
│       ├── ProfileSetupScreen.jsx ← 3-step: info → photos → preferences
│       ├── DiscoverScreen.jsx     ← Swipeable card stack
│       ├── MatchScreen.jsx        ← Match celebration overlay
│       ├── MatchesScreen.jsx      ← Matches list + conversations
│       ├── ChatScreen.jsx         ← 1:1 messaging
│       └── ProfileScreen.jsx      ← Own profile + settings
```

---

## Firebase Setup

1. Go to https://console.firebase.google.com
2. Create a new project → "spark"
3. Add a Web app → copy the config object
4. Paste into `src/firebase/config.js`
5. Enable these services:
   - **Authentication** → Email/Password + Google
   - **Firestore** → Start in test mode
   - **Storage** → Start in test mode

---

## Firestore Schema

```
users/{uid}
  name:            string
  age:             number
  gender:          'man' | 'woman' | 'nonbinary' | 'other'
  bio:             string
  city:            string
  photoURLs:       string[]       ← Firebase Storage download URLs
  preference:      'men' | 'women' | 'everyone'
  minAge:          number
  maxAge:          number
  profileComplete: boolean
  lastActive:      timestamp
  createdAt:       timestamp

swipes/{swiperId}_{swipedId}
  swiperId:   string
  swipedId:   string
  action:     'like' | 'pass' | 'super'
  createdAt:  timestamp

matches/{matchId}                 ← matchId = sorted([uid1,uid2]).join('_')
  users:      string[]            ← [uid1, uid2]
  active:     boolean
  createdAt:  timestamp

  messages/{msgId}                ← subcollection
    senderId:  string
    text:      string
    readAt:    timestamp | null
    createdAt: timestamp

reports/{reportId}
  reporterId:  string
  reportedId:  string
  reason:      'spam' | 'harassment' | 'fake' | 'inappropriate' | 'other'
  detail:      string
  resolved:    boolean
  createdAt:   timestamp
```

---

## Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can read all profiles, write only their own
    match /users/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == uid;
    }

    // Swipes — only the swiper can create/read their swipes
    match /swipes/{swipeId} {
      allow read, write: if request.auth != null &&
        request.auth.uid == resource.data.swiperId;
      allow create: if request.auth != null;
    }

    // Matches — only participants can read/write
    match /matches/{matchId} {
      allow read, write: if request.auth != null &&
        request.auth.uid in resource.data.users;

      // Messages subcollection — only match participants
      match /messages/{msgId} {
        allow read: if request.auth != null &&
          request.auth.uid in get(/databases/$(database)/documents/matches/$(matchId)).data.users;
        allow create: if request.auth != null &&
          request.auth.uid in get(/databases/$(database)/documents/matches/$(matchId)).data.users &&
          request.resource.data.senderId == request.auth.uid;
      }
    }

    // Reports — authenticated users can create, only admin reads
    match /reports/{reportId} {
      allow create: if request.auth != null;
      allow read: if false; // admin only via Firebase Admin SDK
    }
  }
}
```

---

## Storage Rules

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /photos/{uid}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == uid
        && request.resource.size < 5 * 1024 * 1024   // 5MB limit
        && request.resource.contentType.matches('image/.*');
    }
  }
}
```

---




---

## Deploy

```bash
# Build for testing
npx expo build:android   # or build:ios
# or use EAS Build:
npx eas build --platform android
```
