import type { Metadata } from "next";
import { assertRuntimeRegistriesValid } from "@/lib/validation/runtime-validation";
import "./globals.css";
import "@/components/dashboard/PeersPanel.css";
import "@/components/dashboard/MapWorkspace.css";
import "@/components/dashboard/ForecastPanel.css";
import "@/components/stocks/StockDetail.css";

const registryValidation = assertRuntimeRegistriesValid();

if (process.env.NODE_ENV !== "production" && registryValidation.warnings.length > 0) {
  console.warn(
    "Dashboard registry validation warnings:\n" +
      registryValidation.warnings
        .map((issue) => `- ${issue.code} at ${issue.path}: ${issue.message}`)
        .join("\n")
  );
}

export const metadata: Metadata = {
  title: "RRC Peer Intelligence",
  description: "Interactive Range Resources peer intelligence dashboard"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
