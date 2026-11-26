import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  ADMIN_AUTH_EMAIL,
  badgeToAuthEmail,
  supervisorToAuthEmail,
} from '../types';

const app = getApps().find((a) => a.name === '[DEFAULT]') || initializeApp(firebaseConfig);

const firestoreDatabaseId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-4cc60044-ac6f-4f75-b2ee-fe64216421fa';

function initDb(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firestoreDatabaseId);
  }
}

export const db = initDb();
export const auth = getAuth(app);

// Strictly in-memory OAuth access token cache (never written to localStorage or sessionStorage)
let cachedGoogleAccessToken: string | null = null;

export function getGoogleSheetsAccessToken(): string | null {
  return cachedGoogleAccessToken;
}

export function clearGoogleSheetsAccessToken(): void {
  cachedGoogleAccessToken = null;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}

export async function connectGoogleSheets(): Promise<string> {
  // Use a secondary Firebase App instance so connecting Google Sheets OAuth
  // never replaces the logged-in Admin or Supervisor password session.
  const sheetsApp =
    getApps().find((a) => a.name === 'GoogleSheetsOAuth') ||
    initializeApp(firebaseConfig, 'GoogleSheetsOAuth');
  const sheetsAuth = getAuth(sheetsApp);

  const sheetsProvider = new GoogleAuthProvider();
  sheetsProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
  sheetsProvider.setCustomParameters({ prompt: 'consent select_account' });

  const res = await signInWithPopup(sheetsAuth, sheetsProvider);
  const credential = GoogleAuthProvider.credentialFromResult(res);
  await firebaseSignOut(sheetsAuth).catch(() => undefined);

  if (!credential?.accessToken) {
    throw new Error('Google Sheets permission was not granted. Please allow spreadsheet access.');
  }
  cachedGoogleAccessToken = credential.accessToken;
  return credential.accessToken;
}

export async function signInWithUsernamePassword(username: string, password: string) {
  const cleanUser = username.trim();
  const authEmail = cleanUser.includes('@')
    ? cleanUser.toLowerCase()
    : supervisorToAuthEmail(cleanUser);
  return signInWithEmailAndPassword(auth, authEmail, password);
}

export async function claimAdminAuthAccount(password: string) {
  const cred = await createUserWithEmailAndPassword(auth, ADMIN_AUTH_EMAIL, password);
  await updateProfile(cred.user, { displayName: 'System Admin' });
  return cred;
}

export async function signInWithBadgePasscode(badgeId: string, passcode: string) {
  const authEmail = badgeToAuthEmail(badgeId);
  return signInWithEmailAndPassword(auth, authEmail, passcode);
}

export async function provisionUserAuthAccount(
  authEmail: string,
  password: string,
  displayName: string
): Promise<{ status: 'created' | 'already_exists' | 'provider_disabled'; uid: string }> {
  const provApp =
    getApps().find((a) => a.name === 'TechProvisioner') ||
    initializeApp(firebaseConfig, 'TechProvisioner');
  const provAuth = getAuth(provApp);

  try {
    const cred = await createUserWithEmailAndPassword(provAuth, authEmail, password);
    await updateProfile(cred.user, { displayName });
    const uid = cred.user.uid;
    await firebaseSignOut(provAuth);
    return { status: 'created', uid };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/email-already-in-use') {
      return { status: 'already_exists', uid: '' };
    }
    if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
      return { status: 'provider_disabled', uid: '' };
    }
    throw err;
  }
}

export const provisionTechnicianAuthAccount = provisionUserAuthAccount;

export async function signOutUser() {
  clearGoogleSheetsAccessToken();
  return firebaseSignOut(auth);
}
