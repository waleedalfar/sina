"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";
import { ArrowRight } from "lucide-react";
import { Wordmark } from "@/components/layout/Sidebar";

/*
  A split sheet rather than a centred card. The left panel makes the claim
  this product exists to make; the right one is the handoff to the
  hospital's own identity provider. There is no password field and there
  never will be — so the right panel spends its space saying exactly where
  you are about to be sent and what will travel with you, which is the
  thing a security reviewer looks for on a login screen.
*/
const VALUE_PROPS = [
  {
    num: "01",
    title: "Structural governance",
    body: "Five sign-offs are a gate in the code path, not a checklist in a document.",
  },
  {
    num: "02",
    title: "Tamper-evident audit",
    body: "Every consequential action is hash-chained and append-only.",
  },
  {
    num: "03",
    title: "Full model lifecycle",
    body: "Import, scan, evaluate, approve, run — with evidence attached at each step.",
  },
];

export default function LoginPage() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.isAuthenticated) router.replace("/dashboard");
  }, [auth.isAuthenticated, router]);

  return (
    <div className="min-h-screen bg-base p-0 lg:grid lg:place-items-center lg:p-8">
      <div className="grid min-h-screen w-full max-w-[1280px] grid-cols-1 border-hairline bg-surface lg:min-h-[720px] lg:grid-cols-[1.15fr_1fr] lg:border lg:shadow-[var(--shadow-raised)]">
        <div className="flex flex-col justify-between gap-10 border-b border-hairline bg-raised px-7 py-10 sm:px-13 sm:py-14 lg:border-r lg:border-b-0">
          <Wordmark size="lg" />

          <div className="flex flex-col gap-8">
            <div>
              <div className="font-mono text-[10px] tracking-[0.24em] text-warning uppercase">AI Governance Console</div>
              <h1 className="mt-3.5 max-w-[12ch] text-[38px] leading-[1.08] font-semibold tracking-[-0.03em] sm:text-[46px]">
                Policy as the code path.
              </h1>
              <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-secondary">
                Most AI governance is a document and a spreadsheet. Sina makes it the thing that stands between a model
                and a patient.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-x-0 gap-y-4 border-t border-strong sm:grid-cols-3">
              {VALUE_PROPS.map((prop) => (
                <div key={prop.num} className="flex flex-col gap-2 pt-4 pr-4 sm:border-r sm:border-hairline sm:last:border-r-0">
                  <div className="font-mono text-[10px] tracking-[0.16em] text-accent">{prop.num}</div>
                  <div className="text-sm font-semibold">{prop.title}</div>
                  <div className="text-[12.5px] leading-relaxed text-secondary">{prop.body}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="font-mono text-[9.5px] tracking-[0.12em] text-secondary uppercase">
            Single tenant · Build MVP 0.1
          </div>
        </div>

        <div className="flex flex-col justify-center gap-5 px-7 py-12 sm:px-11">
          <div>
            <div className="font-mono text-[10px] tracking-[0.24em] text-secondary uppercase">Sign in</div>
            <h2 className="mt-2.5 text-2xl font-semibold tracking-[-0.02em]">Hospital identity required</h2>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-secondary">
              Sina holds no passwords. Authentication is delegated to your organisation&apos;s identity provider; your
              roles arrive with the assertion.
            </p>
          </div>

          {/* The handoff, spelled out. Nothing here is guessed — it is the
              relying-party configuration this build will actually use. */}
          <dl className="border border-hairline bg-raised p-3.5 font-mono text-[10.5px] leading-[1.8] text-secondary">
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 tracking-[0.14em] uppercase">Provider</dt>
              <dd className="min-w-0 break-all text-primary/80">{providerHost(auth.settings?.authority)}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 tracking-[0.14em] uppercase">Protocol</dt>
              <dd>OIDC · authorization code + PKCE</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 tracking-[0.14em] uppercase">Scopes</dt>
              <dd className="min-w-0 break-all">{auth.settings?.scope ?? "openid profile"}</dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={() => auth.signinRedirect()}
            disabled={auth.isLoading}
            className="flex items-center justify-between gap-4 border border-accent-strong bg-accent px-5 py-4 font-mono text-[11.5px] tracking-[0.18em] text-inverted uppercase transition-colors hover:bg-accent-strong disabled:pointer-events-none disabled:border-hairline disabled:bg-raised disabled:text-tertiary"
          >
            <span>{auth.isLoading ? "Connecting…" : "Continue to hospital SSO"}</span>
            <ArrowRight className="h-4 w-4" />
          </button>

          {auth.error && (
            <p className="border border-danger border-l-4 bg-danger-bg px-3.5 py-3 text-[12.5px] text-danger">
              {auth.error.message}
            </p>
          )}

          <p className="font-mono text-[9.5px] leading-relaxed text-secondary">
            Every sign-in is written to the audit chain before the session is issued.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Show the host, not the whole issuer URL: the realm path is noise, and
 * the host is the part a reader can actually check against what they
 * expect. */
function providerHost(authority: string | undefined) {
  if (!authority) return "—";
  try {
    return new URL(authority).host;
  } catch {
    return authority;
  }
}
