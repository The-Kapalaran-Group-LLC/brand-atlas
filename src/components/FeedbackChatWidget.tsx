import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';


import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { Loader2, Menu, MessageSquareText, Send, Shield, X } from 'lucide-react';
import { submitFeedbackToSupabase } from '../api/submitFeedbackToSupabase';

const MAX_MESSAGE_LENGTH = 2000;

type SubmitState = {
  type: 'idle' | 'success' | 'error';
  message: string;
};

type FeedbackChatWidgetProps = {
  showAdminShortcut?: boolean;
  adminHref?: string;
  onAdminNavigate?: () => void;
};

export function FeedbackChatWidget({
  showAdminShortcut = false,
  adminHref = '/#admin',
  onAdminNavigate,
}: FeedbackChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({ type: 'idle', message: '' });
  const adminMenuRef = useRef<HTMLDivElement>(null);

  const remainingChars = useMemo(() => MAX_MESSAGE_LENGTH - message.length, [message.length]);

  const resetStateForNewAttempt = () => {
    if (submitState.type !== 'idle') {
      setSubmitState({ type: 'idle', message: '' });
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setSubmitState({ type: 'error', message: 'Please enter a message.' });
      return;
    }

    setIsSubmitting(true);
    setSubmitState({ type: 'idle', message: '' });

    try {
      await submitFeedbackToSupabase({
        message: trimmedMessage,
        pageUrl: window.location.href,
      });
      setSubmitState({ type: 'success', message: 'Thanks, your feedback is greatly appreciated.' });
      setMessage('');
    } catch (error) {
      const errText = error instanceof Error ? error.message : 'Failed to submit feedback.';
      setSubmitState({ type: 'error', message: errText });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isAdminMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!adminMenuRef.current) return;
      if (adminMenuRef.current.contains(event.target as Node)) return;
      console.log('[FeedbackChatWidget] Closing admin shortcut menu from outside click.');
      setIsAdminMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      console.log('[FeedbackChatWidget] Closing admin shortcut menu from escape key.');
      setIsAdminMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isAdminMenuOpen]);

  const widget = (
    <div
      className="fixed right-3 sm:right-5 z-[1000] pointer-events-auto no-print"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
    >
      <AnimatePresence>
        {isOpen && (
          <motion.section
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="mb-3 w-[min(92vw,24rem)] rounded-3xl border border-zinc-200 bg-white shadow-[0_14px_45px_-18px_rgba(0,0,0,0.35)]"
          >
            <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-zinc-900">Share Feedback</p>
                <p className="text-xs text-zinc-500">Messages are shared anonymously.</p>
              </div>
              <button
                type="button"
                aria-label="Close feedback chat"
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form onSubmit={handleSubmit} className="space-y-3 px-4 py-4">
              <label className="block text-xs font-medium text-zinc-600">
                Message
                <textarea
                  value={message}
                  onChange={(e) => {
                    resetStateForNewAttempt();
                    setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH));
                  }}
                  required
                  rows={4}
                  className="mt-1 w-full resize-y rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  placeholder="Share feedback, bugs, ideas, or requests..."
                />
              </label>

              <div className="flex items-center justify-between gap-2">
                <p className={`text-[11px] ${remainingChars < 120 ? 'text-amber-600' : 'text-zinc-500'}`}>
                  {remainingChars} characters left
                </p>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {isSubmitting ? 'Sending...' : 'Send'}
                </button>
              </div>

              {submitState.type === 'success' && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  {submitState.message}
                </p>
              )}
              {submitState.type === 'error' && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {submitState.message}
                </p>
              )}
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <div
        data-testid="feedback-widget-actions"
        className={`ml-auto flex items-center justify-end gap-2 ${isOpen ? 'w-[min(92vw,24rem)]' : ''}`}
      >
        <button
          type="button"
          data-testid="feedback-widget-toggle"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm font-medium text-zinc-900 shadow-[0_10px_30px_-16px_rgba(0,0,0,0.45)] transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_14px_34px_-16px_rgba(0,0,0,0.45)]"
        >
          <MessageSquareText className="h-4 w-4 text-indigo-600" />
          Share Feedback
        </button>

        {showAdminShortcut && (
          <div ref={adminMenuRef} className="relative">
            <button
              type="button"
              data-testid="feedback-admin-menu-trigger"
              aria-label="Open quick actions menu"
              aria-expanded={isAdminMenuOpen}
              onClick={() => {
                const nextOpen = !isAdminMenuOpen;
                console.log('[FeedbackChatWidget] Toggling admin shortcut menu.', { nextOpen });
                setIsAdminMenuOpen(nextOpen);
              }}
              className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3 text-zinc-900 shadow-[0_10px_30px_-16px_rgba(0,0,0,0.45)] transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_14px_34px_-16px_rgba(0,0,0,0.45)]"
            >
              <Menu className="h-4 w-4 text-indigo-600" />
            </button>

            <AnimatePresence>
              {isAdminMenuOpen && (
                <motion.div
                  data-testid="feedback-admin-menu-panel"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute right-0 bottom-[calc(100%+0.5rem)] min-w-[12rem] rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_14px_38px_-18px_rgba(0,0,0,0.45)]"
                >
                  <a
                    href={adminHref}
                    data-testid="feedback-admin-menu-admin-link"
                    onClick={(event) => {
                      console.log('[FeedbackChatWidget] Admin Page shortcut selected from hamburger menu.', {
                        adminHref,
                      });
                      if (onAdminNavigate) {
                        event.preventDefault();
                        onAdminNavigate();
                      }
                      setIsAdminMenuOpen(false);
                    }}
                    className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    <Shield className="h-4 w-4 text-zinc-500" />
                    Admin Page
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return widget;
  }

  return createPortal(widget, document.body);
}
