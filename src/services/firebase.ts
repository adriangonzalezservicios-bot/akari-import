import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type Auth,
  type User
} from 'firebase/auth';

export const firebaseConfig = {
  apiKey: "AIzaSyCjDvo0SGwsMerfSsJ5LSmVGXG6BA6R0SU",
  authDomain: "akari-80531.firebaseapp.com",
  projectId: "akari-80531",
  storageBucket: "akari-80531.firebasestorage.app",
  messagingSenderId: "252656159221",
  appId: "1:252656159221:web:da2f7bade2a4039c2838bc",
  measurementId: "G-9FR7RSF3JK"
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

try {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);
} catch (err) {
  console.warn('Firebase init warning:', err);
}

export { auth };

export async function loginWithEmail(email: string, pass: string): Promise<User> {
  if (!auth) throw new Error('Firebase Auth no inicializado');
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  return cred.user;
}

export async function logoutUser(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

export function subscribeAuth(callback: (user: User | null) => void): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}
