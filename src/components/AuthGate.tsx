import React, { useState } from 'react';
import {
  BarChart3,
  Building2,
  CalendarClock,
  FileSpreadsheet,
  HardHat,
  KeyRound,
  LogOut,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  WifiOff,
  Wrench,
} from 'lucide-react';
import { claimDefaultAdminGrant } from '../lib/dataService';
import {
  claimAdminAuthAccount,
  signInWithBadgePasscode,
  signInWithUsernamePassword,
  signOutUser,
} from '../lib/firebase';
import { ADMIN_USERNAME } from '../types';
import { ThemeSwitcher } from './ThemeSwitcher';

interface AuthGateProps {
  mode: 'signin' | 'unauthorized';
  userEmail?: string | null;
  inactive?: boolean;
  onRetryAccess?: () => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  mode,
  userEmail,
  inactive,
  onRetryAccess,
}) => {
  const [loginTab, setLoginTab] = useState<'technician' | 'supervisor'>('technician');
  const [badgeId, setBadgeId] = useState('');
  const [passcode, setPasscode] = useState('');

  const [username, setUsername] = useState('');
  const [supPassword, setSupPassword] = useState('');
  const [adminSetupMode, setAdminSetupMode] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');

  const [signingIn, setSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [providerDisabled, setProviderDisabled] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const handleSupervisorSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !supPassword.trim()) {
      setErrorMsg('Enter both your Username and Password.');
      return;
    }
    setSigningIn(true);
    setErrorMsg(null);
    setProviderDisabled(false);
    try {
      await signInWithUsernamePassword(username, supPassword);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
        setProviderDisabled(true);
        setErrorMsg(
          'Email/Password sign-in is not yet enabled in Firebase Console. Enable Email/Password under Authentication > Sign-in method.'
        );
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setErrorMsg(
          'Invalid username or password. If this is a brand-new installation, click "First-time Admin setup" below to initialize the default admin account.'
        );
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to sign in.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword.trim().length < 8) {
      setErrorMsg('Admin password must be at least 8 characters.');
      return;
    }
    if (adminPassword !== adminConfirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setSigningIn(true);
    setErrorMsg(null);
    setProviderDisabled(false);
    try {
      const cred = await claimAdminAuthAccount(adminPassword.trim());
      await claimDefaultAdminGrant(cred.user.uid);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/email-already-in-use') {
        setErrorMsg(
          'The default Admin account ("admin") is already initialized. Switch back to Username & Password sign-in.'
        );
        setAdminSetupMode(false);
        setUsername(ADMIN_USERNAME);
      } else if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
        setProviderDisabled(true);
        setErrorMsg(
          'Email/Password sign-in is not yet enabled in Firebase Console. Enable it under Authentication > Sign-in method first.'
        );
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to initialize Admin account.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleBadgeSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!badgeId.trim() || !passcode.trim()) {
      setErrorMsg('Enter both your Technician Badge ID and Passcode.');
      return;
    }
    setSigningIn(true);
    setErrorMsg(null);
    setProviderDisabled(false);
    try {
      await signInWithBadgePasscode(badgeId, passcode);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
        setProviderDisabled(true);
        setErrorMsg(
          'Email/Password sign-in is not yet enabled in Firebase Console. Ask your Admin to enable Email/Password under Authentication > Sign-in method.'
        );
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setErrorMsg('Invalid Badge ID or Passcode. Check with your Facility Supervisor.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to sign in.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  if (mode === 'unauthorized') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="max-w-lg w-full mb-4 flex justify-end">
          <ThemeSwitcher variant="compact" />
        </div>
        <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8">
          <div className="w-11 h-11 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {inactive ? 'Account Access Suspended' : 'Access Not Provisioned'}
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Signed in as{' '}
            <span className="font-mono font-medium text-slate-900 dark:text-white">{userEmail}</span>.{' '}
            {inactive
              ? 'Your facility access status is currently marked inactive. Contact your Admin or Facility Supervisor to reactivate your account.'
              : 'This account is not registered with an active Facility Assist access grant. Contact your Admin or Facility Supervisor.'}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {onRetryAccess && (
              <button
                type="button"
                onClick={onRetryAccess}
                className="px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 transition-colors whitespace-nowrap"
              >
                Re-check Account Access
              </button>
            )}
            <button
              type="button"
              onClick={() => signOutUser()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              Switch Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 grid lg:grid-cols-12 items-stretch">
      {/* Left Architectural Visual Panel */}
      <div className="lg:col-span-7 relative bg-slate-900 overflow-hidden min-h-[260px] lg:min-h-screen flex flex-col justify-between p-8 lg:p-12">
        {!imgFailed ? (
          <img
            src="/src/assets/images/facility_login_backdrop_1795509497403.jpg"
            alt="Commercial building chiller and mechanical plant room"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-brand-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-slate-950/40" />

        <div className="relative z-10 flex items-center gap-3 text-white">
          <div className="w-9 h-9 rounded-lg bg-brand-700 flex items-center justify-center transition-colors">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">Facility Assist</span>
        </div>

        <div className="relative z-10 max-w-xl mt-10">
          <h1 className="text-3xl lg:text-4xl font-semibold text-white tracking-tight leading-tight text-balance">
            All-in-one facility PPM, QR asset tracking, field operations, and AMC compliance.
          </h1>
          <p className="mt-4 text-sm lg:text-base text-slate-200 leading-relaxed max-w-lg">
            Manage multi-building maintenance end to end — scan asset QR tags to inspect maintenance logs &amp; last PPM reports, log in-house &amp; AMC contractor PPMs with scanned reports, track repairs, overtime, utilities, and broadcast urgent building alerts.
          </p>

          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4 border-t border-white/15 pt-6 text-slate-200">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-white">
                <CalendarClock className="w-4 h-4 text-brand-400 shrink-0" />
                PPM &amp; 2-Week Alerts
              </div>
              <p className="mt-1 text-xs text-slate-300">
                In-house &amp; AMC schedules, scanned vendor sheets &amp; auto due dates.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-white">
                <QrCode className="w-4 h-4 text-brand-400 shrink-0" />
                QR Asset Scanner
              </div>
              <p className="mt-1 text-xs text-slate-300">
                Scan equipment QR labels for instant logs &amp; last PPM history.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-white">
                <Wrench className="w-4 h-4 text-brand-400 shrink-0" />
                Repairs &amp; Upgrades
              </div>
              <p className="mt-1 text-xs text-slate-300">
                Before/after photo evidence &amp; supervisor approval workflow.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-white">
                <BarChart3 className="w-4 h-4 text-brand-400 shrink-0" />
                Utilities &amp; Schedules
              </div>
              <p className="mt-1 text-xs text-slate-300">
                Meter readings, anomalies, daily work orders &amp; tenant visits.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-white">
                <WifiOff className="w-4 h-4 text-brand-400 shrink-0" />
                Remote Offline Mode
              </div>
              <p className="mt-1 text-xs text-slate-300">
                Queue logs &amp; photos in basements; auto-syncs online.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-white">
                <FileSpreadsheet className="w-4 h-4 text-brand-400 shrink-0" />
                Excel &amp; Sheets Backup
              </div>
              <p className="mt-1 text-xs text-slate-300">
                Date-range Excel exports, bulk import &amp; Google Sheets sync.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Sign-In Column */}
      <div className="lg:col-span-5 flex flex-col justify-between p-6 sm:p-8 lg:p-12 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 transition-colors">
        <div className="flex justify-end">
          <ThemeSwitcher variant="compact" />
        </div>

        <div className="w-full max-w-sm mx-auto my-auto py-6">
          <p className="text-xs font-medium text-brand-700 dark:text-brand-400">
            Facility Operations Portal
          </p>
          <h2 className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            Sign in to Facility Assist
          </h2>

          {/* Role Login Switcher */}
          <div className="mt-5 grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setLoginTab('technician');
                setErrorMsg(null);
              }}
              className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                loginTab === 'technician'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <HardHat className="w-3.5 h-3.5" />
              Technician
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginTab('supervisor');
                setErrorMsg(null);
              }}
              className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                loginTab === 'supervisor'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Supervisor / Admin
            </button>
          </div>

          {errorMsg && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 space-y-1">
              <p>{errorMsg}</p>
              {providerDisabled && (
                <p className="text-[11px] text-red-800 dark:text-red-200">
                  Enable Email/Password in Firebase Console → Authentication → Sign-in method → Email/Password.
                </p>
              )}
            </div>
          )}

          {loginTab === 'technician' ? (
            <form onSubmit={handleBadgeSignIn} className="mt-5 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Sign in with your Employee Code / Badge ID and Passcode assigned by your building supervisor.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Employee Code / Badge ID
                </label>
                <input
                  type="text"
                  required
                  value={badgeId}
                  onChange={(e) => setBadgeId(e.target.value.toUpperCase())}
                  placeholder="e.g. 12345"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Passcode
                </label>
                <input
                  type="password"
                  required
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="e.g. 12345"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>

              <button
                type="submit"
                disabled={signingIn}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-60 transition-colors cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                {signingIn ? 'Signing in...' : 'Open Technician Portal'}
              </button>
            </form>
          ) : adminSetupMode ? (
            <form onSubmit={handleClaimAdmin} className="mt-5 space-y-4">
              <div className="p-3 rounded-lg bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 text-xs text-brand-900 dark:text-brand-200">
                Initialize the one-time default <strong>{ADMIN_USERNAME}</strong> account. Only Admin can create supervisor accounts and inspect all buildings across teams.
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Default Admin Username
                </label>
                <input
                  type="text"
                  readOnly
                  value={ADMIN_USERNAME}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Set Admin Password * (min 8 chars)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Choose a strong password"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Confirm Admin Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={adminConfirmPassword}
                  onChange={(e) => setAdminConfirmPassword(e.target.value)}
                  placeholder="Re-enter admin password"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>

              <button
                type="submit"
                disabled={signingIn}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-60 transition-colors cursor-pointer"
              >
                <UserCheck className="w-4 h-4" />
                {signingIn ? 'Initializing Admin...' : 'Activate Default Admin Account'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setAdminSetupMode(false);
                  setErrorMsg(null);
                }}
                className="w-full text-center text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-brand-700 dark:hover:text-brand-400"
              >
                Back to Username &amp; Password Sign-In
              </button>
            </form>
          ) : (
            <form onSubmit={handleSupervisorSignIn} className="mt-5 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Supervisors sign in with their Admin-provisioned username &amp; password to manage their own buildings, technicians, QR tags, and records.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. 12345"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={supPassword}
                  onChange={(e) => setSupPassword(e.target.value)}
                  placeholder="e.g. 12345"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>

              <button
                type="submit"
                disabled={signingIn}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-60 transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                {signingIn ? 'Signing in...' : 'Open Supervisor / Admin Portal'}
              </button>

              <div className="pt-1 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  First deployment?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAdminSetupMode(true);
                    setErrorMsg(null);
                  }}
                  className="font-medium text-brand-700 dark:text-brand-400 hover:underline cursor-pointer"
                >
                  First-time Admin setup →
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col items-center gap-2 text-center">
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Switch between Light/Dark mode and color themes anytime using the controls above.
          </p>
          <div className="inline-flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-400 font-mono text-[10px] font-semibold flex items-center justify-center">
              IM
            </span>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Developed by Ishan Madhushanka
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
