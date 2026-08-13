"use client";

import { useEffect } from "react";
import Lenis from "lenis";

interface SmoothScrollProps {
  children: React.ReactNode;
}

export default function SmoothScroll({ children }: SmoothScrollProps) {
  useEffect(() => {
    // Respect prefers-reduced-motion: if reduced motion is enabled, use normal browser scrolling
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      return;
    }

    // Lightweight Lenis instance with natural smooth scrolling & moderate duration
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      syncTouch: false, // Do NOT disable native scrolling on mobile/touch devices
      touchMultiplier: 1,
      wheelMultiplier: 1,
    });

    let animationFrameId: number;

    const raf = (time: number) => {
      lenis.raf(time);
      animationFrameId = requestAnimationFrame(raf);
    };

    animationFrameId = requestAnimationFrame(raf);

    // Support smooth scrolling for anchor/link targets
    const handleAnchorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href^='#']");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href === "#") return;

      const targetElement = document.querySelector(href);
      if (targetElement) {
        e.preventDefault();
        lenis.scrollTo(targetElement as HTMLElement);
      }
    };

    document.addEventListener("click", handleAnchorClick);

    // Listen to changes in prefers-reduced-motion setting
    const handleMotionChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        cancelAnimationFrame(animationFrameId);
        lenis.destroy();
      }
    };

    mediaQuery.addEventListener?.("change", handleMotionChange);

    // Cleanup and destroy Lenis instance on unmount
    return () => {
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener("click", handleAnchorClick);
      mediaQuery.removeEventListener?.("change", handleMotionChange);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
