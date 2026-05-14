import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';

const DEFAULT_BADGE_CLASS_NAME =
  'align-super ml-3 inline-block px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold tracking-wide border border-indigo-200';
const MENU_CARD_CLASS_NAME =
  'text-left bg-white/90 border border-zinc-200/80 border-[1px] rounded-3xl p-6 hover:border-zinc-300 hover:shadow-sm transition-all h-full flex flex-col justify-start main-box-hover';

export type MenuPageCard = {
  id: string;
  title: string;
  description: string;
  bullets: string[];
  icon: ReactNode;
  onClick: () => void;
  badgeText?: string;
  badgeClassName?: string;
  bulletsMarginClassName?: string;
};

type MenuPageProps = {
  subtitle: string;
  cards: MenuPageCard[];
  sectionClassName?: string;
  cardsGridClassName?: string;
};

export default function MenuPage({
  subtitle,
  cards,
  sectionClassName = 'max-w-6xl',
  cardsGridClassName = 'grid grid-cols-1 md:grid-cols-3 gap-8 items-start',
}: MenuPageProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className={`${sectionClassName} mx-auto text-center min-h-[78vh] flex flex-col`}
      data-testid="menu-page"
    >
      <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 mb-3 mx-auto">
        <Sparkles className="w-5 h-5" />
      </div>
      <h1 className="text-lg md:text-xl font-semibold tracking-tight text-zinc-950 mb-4 select-none">
        Brand <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-fuchsia-500">Atlas</span>
      </h1>
      <div className="flex-1 flex flex-col justify-center">
        <h2 className="text-[1.91rem] md:text-[2.55rem] font-semibold tracking-tight text-zinc-900 mb-3">
          Choose Your Research Experience
        </h2>
        <p className="subheader-copy text-zinc-700 mb-10 text-lg md:text-xl font-medium">{subtitle}</p>
        <div className={cardsGridClassName}>
          {cards.map((card) => (
            <button
              key={card.id}
              onClick={card.onClick}
              className={MENU_CARD_CLASS_NAME}
              data-testid={`menu-page-card-${card.id}`}
            >
              <div className="inline-flex items-center gap-2 text-zinc-800 font-semibold mb-2 text-lg md:text-xl items-start">
                {card.icon} {card.title}
                {card.badgeText && (
                  <span
                    className={
                      card.badgeClassName ?? DEFAULT_BADGE_CLASS_NAME
                    }
                  >
                    {card.badgeText}
                  </span>
                )}
              </div>
              <p className="subheader-copy text-base text-zinc-500">{card.description}</p>
              <ul className={`${card.bulletsMarginClassName ?? 'mt-4'} space-y-1`}>
                {card.bullets.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-zinc-500">
                    <span className="w-1 h-1 rounded-full bg-zinc-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
