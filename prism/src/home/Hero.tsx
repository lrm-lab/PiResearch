// The brand panel at the top of the home: CoForge's landing gradient in a rounded-3xl panel (dark
// in both themes, like the landing page), a shimmering eyebrow, a two-line blur-reveal headline and
// the composer. The shader pauses under reduced motion and while the panel is scrolled away; without
// WebGL2 a still gradient in the same colours stands in.

import { useEffect, useRef, useState } from "react";
import { useMediaQuery, REDUCED_MOTION_QUERY } from "../lib/media";
import { AnimatedGradient } from "../ui/effects/AnimatedGradient";
import { BlurReveal } from "./BlurReveal";
import { Composer } from "./Composer";
import { SubmitGhost } from "./SubmitGhost";

const LINE_1 = "提出一个问题，";
const LINE_2 = "智能体分头查清。";

export function Hero({ webgl }: { webgl: boolean }) {
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const panelRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? true));
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={panelRef}
      aria-labelledby="home-hero-title"
      className="relative isolate overflow-hidden rounded-3xl text-white ring-1 ring-white/10 ring-inset"
    >
      <div aria-hidden="true" className="home-hero-still absolute inset-0 -z-30" />
      {webgl && <AnimatedGradient paused={reducedMotion || !inView} className="-z-20" />}
      <div aria-hidden="true" className="home-hero-veil pointer-events-none absolute inset-0 -z-10" />

      <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 pt-9 pb-5 text-center sm:px-8 sm:pt-14 sm:pb-10">
        <p className="prism-shimmer text-xs font-medium tracking-[0.22em] text-white/55 [--shimmer-contrast:white]">
          PIRESEARCH · 多智能体深度研究
        </p>
        <h2 id="home-hero-title" className="sr-only">
          {LINE_1}
          {LINE_2}
        </h2>
        <div aria-hidden="true" className="mt-4 text-display-xs font-semibold tracking-[-0.02em] sm:mt-5 sm:text-display-md">
          <BlurReveal className="block" speedReveal={1.2}>
            {LINE_1}
          </BlurReveal>
          <BlurReveal className="block" speedReveal={1.2} delay={0.3}>
            {LINE_2}
          </BlurReveal>
        </div>
        <p className="mt-3 hidden max-w-md text-sm text-white/65 sm:block">
          多个智能体并行检索、交叉核验，把结论和出处写成一份报告。
        </p>
        <div className="relative mt-6 w-full sm:mt-8">
          <Composer />
          <SubmitGhost />
        </div>
      </div>
    </section>
  );
}
