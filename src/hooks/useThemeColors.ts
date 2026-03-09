import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

export interface ThemeColors {
  background: string;
  foreground: string;
  primary: string;
  primary_foreground: string;
  secondary: string;
  secondary_foreground: string;
  accent: string;
  accent_foreground: string;
  muted: string;
  muted_foreground: string;
  destructive: string;
  card: string;
  card_foreground: string;
  border: string;
}

const defaultColors: ThemeColors = {
  background: "#f7fafd",
  foreground: "#0a1929",
  primary: "#0092ff",
  primary_foreground: "#ffffff",
  secondary: "#e8f4ff",
  secondary_foreground: "#003d6b",
  accent: "#ff6b2c",
  accent_foreground: "#ffffff",
  muted: "#edf3f8",
  muted_foreground: "#5a7a99",
  destructive: "#e53935",
  card: "#ffffff",
  card_foreground: "#0a1929",
  border: "#d0e3f2",
};

function hexToHSL(hex: string): string {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

let cached: ThemeColors | null = null;
let cachedForTenant: string | null = null;

export function useThemeColors() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id || null;

  const [colors, setColors] = useState<ThemeColors>(
    cached && cachedForTenant === tenantId ? cached : defaultColors
  );

  useEffect(() => {
    if (cached && cachedForTenant === tenantId) {
      applyColors(cached);
      return;
    }

    const load = async () => {
      try {
        let merged: ThemeColors = { ...defaultColors };

        if (tenant) {
          // Use tenant settings for theme colors
          const ts = tenant.settings;
          for (const key of Object.keys(defaultColors) as (keyof ThemeColors)[]) {
            if (ts[`color_${key}`]) merged[key] = ts[`color_${key}`];
          }
        } else {
          // Global: fetch from api_settings
          const { data } = await supabase
            .from("api_settings")
            .select("settings")
            .eq("provider", "site_branding")
            .maybeSingle();

          const s = (data?.settings as Record<string, any>) || {};
          for (const key of Object.keys(defaultColors) as (keyof ThemeColors)[]) {
            if (s[`color_${key}`]) merged[key] = s[`color_${key}`];
          }
        }

        cached = merged;
        cachedForTenant = tenantId;
        setColors(merged);
        applyColors(merged);
      } catch {
        // use defaults
      }
    };
    load();
  }, [tenant, tenantId]);

  return colors;
}

function applyColors(colors: ThemeColors) {
  const root = document.documentElement;
  const map: Record<keyof ThemeColors, string> = {
    background: "--background",
    foreground: "--foreground",
    primary: "--primary",
    primary_foreground: "--primary-foreground",
    secondary: "--secondary",
    secondary_foreground: "--secondary-foreground",
    accent: "--accent",
    accent_foreground: "--accent-foreground",
    muted: "--muted",
    muted_foreground: "--muted-foreground",
    destructive: "--destructive",
    card: "--card",
    card_foreground: "--card-foreground",
    border: "--border",
  };

  for (const [key, cssVar] of Object.entries(map)) {
    const hex = colors[key as keyof ThemeColors];
    if (hex && hex.startsWith("#")) {
      root.style.setProperty(cssVar, hexToHSL(hex));
    }
  }
  if (colors.border?.startsWith("#")) root.style.setProperty("--input", hexToHSL(colors.border));
  if (colors.primary?.startsWith("#")) root.style.setProperty("--ring", hexToHSL(colors.primary));
}

export function invalidateThemeCache() {
  cached = null;
  cachedForTenant = null;
}
