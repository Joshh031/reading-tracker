import { auth } from "./firebaseConfig.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";
export async function signIn() {
  await setPersistence(auth, browserLocalPersistence);
  try {
    return await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    if (
      [
        "auth/popup-blocked",
        "auth/operation-not-supported-in-this-environment",
      ].includes(e.code)
    )
      return signInWithRedirect(auth, new GoogleAuthProvider());
    throw e;
  }
}
export async function vault(action, input = {}) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw Error("Sign in to open your private archive.");
  const response = await fetch("/api/vault", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token,
    },
    body: JSON.stringify({ action, ...input }),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(
      result.error?.message || "The archive request failed.",
    );
    error.code = result.error?.code;
    throw error;
  }
  return result;
}
