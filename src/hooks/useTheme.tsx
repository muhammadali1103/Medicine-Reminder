import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type ThemeColor =
  | "teal"
  | "ocean"
  | "sunset"
  | "rose"
  | "emerald"
  | "amber"
  | "violet";

interface ThemeContextType {
  isDark: boolean;
  toggleDark: () => void;
  themeColor: ThemeColor;
  setThemeColor: (color: ThemeColor) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const colorPalettes: Record<
  ThemeColor,
  {
    light: string;
    dark: string;
    glowLight: string;
    glowDark: string;
    accentLight: string;
    accentDark: string;
    accentForegroundLight: string;
    accentForegroundDark: string;
    gradientLight: string;
    gradientDark: string;
    heroLight: string;
    heroDark: string;
  }
> = {
  teal: {
    light: "174 62% 42%",
    dark: "174 60% 50%",
    glowLight: "186 72% 52%",
    glowDark: "190 78% 62%",
    accentLight: "174 45% 92%",
    accentDark: "174 40% 18%",
    accentForegroundLight: "174 62% 35%",
    accentForegroundDark: "174 60% 70%",
    gradientLight: "linear-gradient(135deg, hsl(174 62% 42%) 0%, hsl(190 72% 50%) 100%)",
    gradientDark: "linear-gradient(135deg, hsl(174 60% 45%) 0%, hsl(190 70% 58%) 100%)",
    heroLight: "linear-gradient(180deg, hsl(174 60% 94%) 0%, hsl(195 55% 97%) 100%)",
    heroDark: "linear-gradient(180deg, hsl(190 30% 14%) 0%, hsl(215 25% 8%) 100%)",
  },
  ocean: {
    light: "217 91% 60%",
    dark: "217 91% 67%",
    glowLight: "196 92% 58%",
    glowDark: "192 90% 68%",
    accentLight: "210 80% 93%",
    accentDark: "217 42% 18%",
    accentForegroundLight: "217 66% 36%",
    accentForegroundDark: "204 90% 78%",
    gradientLight: "linear-gradient(135deg, hsl(217 91% 60%) 0%, hsl(192 92% 55%) 100%)",
    gradientDark: "linear-gradient(135deg, hsl(217 88% 63%) 0%, hsl(192 86% 66%) 100%)",
    heroLight: "linear-gradient(180deg, hsl(213 100% 95%) 0%, hsl(193 100% 97%) 100%)",
    heroDark: "linear-gradient(180deg, hsl(215 42% 16%) 0%, hsl(222 30% 9%) 100%)",
  },
  sunset: {
    light: "18 92% 57%",
    dark: "20 94% 64%",
    glowLight: "340 88% 64%",
    glowDark: "336 90% 72%",
    accentLight: "24 100% 93%",
    accentDark: "12 44% 18%",
    accentForegroundLight: "14 72% 38%",
    accentForegroundDark: "18 100% 80%",
    gradientLight: "linear-gradient(135deg, hsl(18 92% 57%) 0%, hsl(340 88% 64%) 100%)",
    gradientDark: "linear-gradient(135deg, hsl(18 90% 62%) 0%, hsl(336 86% 70%) 100%)",
    heroLight: "linear-gradient(180deg, hsl(20 100% 95%) 0%, hsl(340 100% 97%) 100%)",
    heroDark: "linear-gradient(180deg, hsl(12 36% 16%) 0%, hsl(330 28% 10%) 100%)",
  },
  rose: {
    light: "338 82% 55%",
    dark: "338 86% 66%",
    glowLight: "18 95% 63%",
    glowDark: "12 98% 72%",
    accentLight: "336 80% 94%",
    accentDark: "336 40% 18%",
    accentForegroundLight: "336 65% 38%",
    accentForegroundDark: "336 82% 80%",
    gradientLight: "linear-gradient(135deg, hsl(338 82% 55%) 0%, hsl(12 92% 64%) 100%)",
    gradientDark: "linear-gradient(135deg, hsl(338 82% 62%) 0%, hsl(12 92% 70%) 100%)",
    heroLight: "linear-gradient(180deg, hsl(336 100% 95%) 0%, hsl(14 100% 97%) 100%)",
    heroDark: "linear-gradient(180deg, hsl(336 34% 15%) 0%, hsl(6 30% 10%) 100%)",
  },
  emerald: {
    light: "152 66% 42%",
    dark: "152 62% 52%",
    glowLight: "172 74% 46%",
    glowDark: "172 70% 58%",
    accentLight: "152 45% 92%",
    accentDark: "152 38% 18%",
    accentForegroundLight: "152 62% 34%",
    accentForegroundDark: "152 65% 76%",
    gradientLight: "linear-gradient(135deg, hsl(152 66% 42%) 0%, hsl(172 74% 46%) 100%)",
    gradientDark: "linear-gradient(135deg, hsl(152 62% 48%) 0%, hsl(172 68% 56%) 100%)",
    heroLight: "linear-gradient(180deg, hsl(150 60% 94%) 0%, hsl(173 60% 97%) 100%)",
    heroDark: "linear-gradient(180deg, hsl(155 32% 14%) 0%, hsl(172 28% 9%) 100%)",
  },
  amber: {
    light: "35 94% 53%",
    dark: "38 96% 62%",
    glowLight: "14 96% 62%",
    glowDark: "18 98% 68%",
    accentLight: "42 100% 92%",
    accentDark: "34 44% 18%",
    accentForegroundLight: "30 72% 34%",
    accentForegroundDark: "42 98% 78%",
    gradientLight: "linear-gradient(135deg, hsl(35 94% 53%) 0%, hsl(14 96% 62%) 100%)",
    gradientDark: "linear-gradient(135deg, hsl(38 92% 58%) 0%, hsl(18 96% 68%) 100%)",
    heroLight: "linear-gradient(180deg, hsl(40 100% 94%) 0%, hsl(20 100% 97%) 100%)",
    heroDark: "linear-gradient(180deg, hsl(30 34% 15%) 0%, hsl(16 28% 10%) 100%)",
  },
  violet: {
    light: "262 83% 58%",
    dark: "262 86% 68%",
    glowLight: "302 76% 62%",
    glowDark: "302 80% 72%",
    accentLight: "264 85% 94%",
    accentDark: "262 40% 18%",
    accentForegroundLight: "262 58% 40%",
    accentForegroundDark: "270 90% 82%",
    gradientLight: "linear-gradient(135deg, hsl(262 83% 58%) 0%, hsl(302 76% 62%) 100%)",
    gradientDark: "linear-gradient(135deg, hsl(262 80% 64%) 0%, hsl(302 76% 72%) 100%)",
    heroLight: "linear-gradient(180deg, hsl(264 100% 95%) 0%, hsl(304 100% 97%) 100%)",
    heroDark: "linear-gradient(180deg, hsl(262 34% 16%) 0%, hsl(292 28% 10%) 100%)",
  },
  blue: {
    light: "217 91% 60%",
    dark: "217 91% 65%",
    glowLight: "196 92% 58%",
    glowDark: "192 90% 68%",
    accentLight: "210 80% 93%",
    accentDark: "217 42% 18%",
    accentForegroundLight: "217 66% 36%",
    accentForegroundDark: "204 90% 78%",
    gradientLight: "linear-gradient(135deg, hsl(217 91% 60%) 0%, hsl(192 92% 55%) 100%)",
    gradientDark: "linear-gradient(135deg, hsl(217 88% 63%) 0%, hsl(192 86% 66%) 100%)",
    heroLight: "linear-gradient(180deg, hsl(213 100% 95%) 0%, hsl(193 100% 97%) 100%)",
    heroDark: "linear-gradient(180deg, hsl(215 42% 16%) 0%, hsl(222 30% 9%) 100%)",
  },
  purple: {
    light: "271 81% 56%",
    dark: "271 81% 65%",
    glowLight: "302 70% 60%",
    glowDark: "302 76% 70%",
    accentLight: "272 75% 94%",
    accentDark: "270 40% 18%",
    accentForegroundLight: "270 62% 38%",
    accentForegroundDark: "275 82% 80%",
    gradientLight: "linear-gradient(135deg, hsl(271 81% 56%) 0%, hsl(302 70% 60%) 100%)",
    gradientDark: "linear-gradient(135deg, hsl(271 80% 62%) 0%, hsl(302 74% 70%) 100%)",
    heroLight: "linear-gradient(180deg, hsl(272 100% 95%) 0%, hsl(302 100% 97%) 100%)",
    heroDark: "linear-gradient(180deg, hsl(270 34% 15%) 0%, hsl(292 28% 10%) 100%)",
  },
  green: {
    light: "142 71% 45%",
    dark: "142 71% 55%",
    glowLight: "165 60% 50%",
    glowDark: "165 65% 60%",
    accentLight: "142 45% 92%",
    accentDark: "142 38% 18%",
    accentForegroundLight: "142 58% 34%",
    accentForegroundDark: "150 70% 76%",
    gradientLight: "linear-gradient(135deg, hsl(142 71% 45%) 0%, hsl(165 60% 50%) 100%)",
    gradientDark: "linear-gradient(135deg, hsl(142 68% 50%) 0%, hsl(165 60% 58%) 100%)",
    heroLight: "linear-gradient(180deg, hsl(142 60% 94%) 0%, hsl(165 60% 97%) 100%)",
    heroDark: "linear-gradient(180deg, hsl(145 30% 14%) 0%, hsl(165 25% 9%) 100%)",
  },
  orange: {
    light: "25 95% 53%",
    dark: "25 95% 60%",
    glowLight: "350 80% 64%",
    glowDark: "350 82% 70%",
    accentLight: "28 100% 92%",
    accentDark: "20 42% 18%",
    accentForegroundLight: "20 72% 34%",
    accentForegroundDark: "24 92% 78%",
    gradientLight: "linear-gradient(135deg, hsl(25 95% 53%) 0%, hsl(350 80% 64%) 100%)",
    gradientDark: "linear-gradient(135deg, hsl(25 92% 58%) 0%, hsl(350 78% 68%) 100%)",
    heroLight: "linear-gradient(180deg, hsl(28 100% 94%) 0%, hsl(350 100% 97%) 100%)",
    heroDark: "linear-gradient(180deg, hsl(18 34% 15%) 0%, hsl(350 26% 10%) 100%)",
  },
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme-dark");
    return saved ? JSON.parse(saved) : false;
  });

  const [themeColor, setThemeColor] = useState<ThemeColor>(() => {
    const saved = localStorage.getItem("theme-color");
    return (saved as ThemeColor) || "teal";
  });

  useEffect(() => {
    localStorage.setItem("theme-dark", JSON.stringify(isDark));
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem("theme-color", themeColor);
    const palette = colorPalettes[themeColor];
    const root = document.documentElement;
    
    if (isDark) {
      root.style.setProperty("--primary", palette.dark);
      root.style.setProperty("--primary-glow", palette.glowDark);
      root.style.setProperty("--accent", palette.accentDark);
      root.style.setProperty("--accent-foreground", palette.accentForegroundDark);
      root.style.setProperty("--gradient-primary", palette.gradientDark);
      root.style.setProperty("--gradient-hero", palette.heroDark);
    } else {
      root.style.setProperty("--primary", palette.light);
      root.style.setProperty("--primary-glow", palette.glowLight);
      root.style.setProperty("--accent", palette.accentLight);
      root.style.setProperty("--accent-foreground", palette.accentForegroundLight);
      root.style.setProperty("--gradient-primary", palette.gradientLight);
      root.style.setProperty("--gradient-hero", palette.heroLight);
    }
  }, [themeColor, isDark]);

  const toggleDark = () => setIsDark(!isDark);

  return (
    <ThemeContext.Provider value={{ isDark, toggleDark, themeColor, setThemeColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
