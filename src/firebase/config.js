// src/firebase/config.js
// Firebase is kept for: Auth (via REST API), Analytics, and future Monetisation.
// Database + Storage have moved to Supabase.
import { initializeApp, getApps, getApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: 'AIzaSyCZ7Ir4TtO7qM8K4SbN3uc18_nW8tQXr7M',
  authDomain: 'cupid-5292e.firebaseapp.com',
  projectId: 'cupid-5292e',
  storageBucket: 'cupid-5292e.firebasestorage.app',
  messagingSenderId: '1078178619703',
  appId: '1:1078178619703:web:6c5e1dfa5daa76a751bab2',
  measurementId: 'G-65GVTHN9W9',
};

// Initialise once — safe across Metro hot-reloads
export const firebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();