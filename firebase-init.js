/* ═══════════════════════════════════════════════════════════════
   FIREBASE INITIALIZATION — v2.0
   - Primary app (owner login)
   - Secondary app (staff creation without sign-out)
   ═══════════════════════════════════════════════════════════════ */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc,
  enableNetwork, disableNetwork, onSnapshot,
  addDoc, updateDoc, collection, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updatePassword,
  signInAnonymously,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCG6s083eJ1ocpVdqRbrnmvVrFlI8D4iwE",
  authDomain: "alshifa-pharmacy.firebaseapp.com",
  projectId: "alshifa-pharmacy",
  storageBucket: "alshifa-pharmacy.firebasestorage.app",
  messagingSenderId: "510930569164",
  appId: "1:510930569164:web:e99cb23c33840b7d557f69"
};

try {
  // ═══ Primary App (Owner) ═══
  const app = initializeApp(firebaseConfig);
  const fdb = getFirestore(app);
  const auth = getAuth(app);

  // ═══ Secondary App (Staff Creation) ═══
  let secondaryApp;
  const existingApps = getApps();
  const existingSecondary = existingApps.find(a => a.name === 'Secondary');
  
  if(existingSecondary){
    secondaryApp = existingSecondary;
  } else {
    secondaryApp = initializeApp(firebaseConfig, 'Secondary');
  }
  const secondaryAuth = getAuth(secondaryApp);

  // Expose globally
  window.FirebaseDB = fdb;
  window.FirebaseAuth = auth;
  window.FirebaseSecondaryAuth = secondaryAuth;

  window.FirebaseFuncs = {
    // Firestore
    doc, setDoc, getDoc,
    enableNetwork, disableNetwork, onSnapshot,
    addDoc, updateDoc, collection, writeBatch,
    // Primary Auth
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    updatePassword,
    signInAnonymously,
    EmailAuthProvider,
    reauthenticateWithCredential,
    // ✅ Staff creation via secondary app
    createUserInSecondary: async function(email, password){
      var cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      // Secondary app se sign out karo taake staff logged in na rahe
      await signOut(secondaryAuth);
      return cred;
    }
  };

  window.FirebaseReady = true;
  window.dispatchEvent(new Event('firebase-ready'));
  console.log('✓ Firebase initialized (Primary + Secondary):', firebaseConfig.projectId);

} catch (e) {
  console.error('✗ Firebase init failed:', e);
  window.FirebaseReady = false;
  window.FirebaseError = e.message;
  window.dispatchEvent(new Event('firebase-ready'));
}
