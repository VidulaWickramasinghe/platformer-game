import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

function getFirebaseConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !storageBucket || !messagingSenderId || !appId) {
    return null;
  }

  return { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId };
}

function initFirebaseIfPossible() {
  if (authInstance && dbInstance) return;
  if (typeof window === "undefined") return;

  const firebaseConfig = getFirebaseConfig();
  if (!firebaseConfig) return;

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  authInstance = getAuth(app);
  dbInstance = getFirestore(app);
}

export function getFirebaseServices() {
  initFirebaseIfPossible();
  if (!authInstance || !dbInstance) return null;
  return { auth: authInstance, db: dbInstance };
}

export async function ensureAnonymousAuth() {
  const services = getFirebaseServices();
  if (!services) return null;

  if (!services.auth.currentUser) {
    await signInAnonymously(services.auth);
  }

  return services.auth;
}
