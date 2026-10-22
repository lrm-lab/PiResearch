// Character-by-character blur reveal, ported from CoForge's copy of Spell's BlurReveal
// (apps/web/src/components/spell/blur-reveal.tsx in the CoForge repo; https://spell.sh, MIT).
// Local change: CJK text has no spaces, so Han characters are revealed (and may wrap) one by one
// instead of being glued into one unbreakable "word". Latin words still stay whole.

import { motion, useReducedMotion, type Variants } from "motion/react";

const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/;

export function BlurReveal({
  children,
  className,
  delay = 0,
  speedReveal = 1.5,
  speedSegment = 0.5,
}: {
  children: string;
  className?: string;
  delay?: number;
  speedReveal?: number;
  speedSegment?: number;
}) {
  const reduced = useReducedMotion() ?? false;
  const stagger = 0.03 / speedReveal;
  const duration = 0.3 / speedSegment;
  const container: Variants = {
    hidden: { opacity: reduced ? 1 : 0 },
    visible: { opacity: 1, transition: { staggerChildren: reduced ? 0 : stagger, delayChildren: reduced ? 0 : delay } },
  };
  const item: Variants = reduced
    ? { hidden: { opacity: 1 }, visible: { opacity: 1 } }
    : {
        hidden: { opacity: 0, filter: "blur(12px)", y: 10 },
        visible: { opacity: 1, filter: "blur(0px)", y: 0, transition: { duration, ease: [0.22, 1, 0.36, 1] } },
      };
  const tokens = children.split(/(\s+)/).filter(Boolean);
  return (
    <motion.span initial="hidden" animate="visible" variants={container} className={className}>
      <span className="sr-only">{children}</span>
      {tokens.map((token, index) => {
        if (/^\s+$/.test(token)) {
          return (
            <motion.span key={index} aria-hidden="true" variants={item} className="inline-block">
              &nbsp;
            </motion.span>
          );
        }
        const chars = Array.from(token);
        if (CJK.test(token)) {
          return chars.map((char, charIndex) => (
            <motion.span key={`${index}-${charIndex}`} aria-hidden="true" variants={item} className="inline-block">
              {char}
            </motion.span>
          ));
        }
        return (
          <span key={index} aria-hidden="true" className="inline-block whitespace-nowrap">
            {chars.map((char, charIndex) => (
              <motion.span key={charIndex} variants={item} className="inline-block">
                {char}
              </motion.span>
            ))}
          </span>
        );
      })}
    </motion.span>
  );
}
