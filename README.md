# PeerGrade

Educational Peer-Review System built with React, Tailwind CSS, and Firebase.

## Features
- **Teacher Role:** Create classes, manage students, design rubrics, and monitor all reviews.
- **Student Role:** Submit work, review peers anonymously, and give meta-feedback on received reviews.
- **Rolling Workflow:** Automated distribution of peer reviews once a submission threshold is met.

## Tech Stack
- **Frontend:** React (Vite), Tailwind CSS
- **Backend:** Firebase (Firestore, Auth)

## Setup Instructions

1. **Clone the repository.**
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Environment Variables:**
   Create a `.env` file in the root directory and add your Firebase credentials:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```
4. **Bootstrapping a Teacher Account:**
   - Sign in with a Google account that has `teacher` or `admin` in the email address (for the initial version).
   - Alternatively, manually change the `role` field to `teacher` in the Firestore `users` collection for your UID.

5. **Run the development server:**
   ```bash
   npm run dev
   ```

## Data Schema
See `README_SCHEMA.md` for a detailed breakdown of the Firestore collections and security rules.
