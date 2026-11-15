import type { Metadata } from "next";
import { SettingsView } from "@/components/shell/settings-view";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 sm:px-8">
      <header className="mb-6">
        <h1 className="text-[1.75rem] leading-[2.25rem] font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-sm text-slate">
          Models, search and storage are configured on the server through environment variables. Nothing here is hard-coded.
        </p>
      </header>
      <SettingsView />
    </div>
  );
}
