import { DARK_TITLE, type RugEntry } from '../config';
import styles from '../hero.module.css';

interface StoryProps {
  rug: RugEntry;
  inCart: boolean;
  onBuy: () => void;
}


/**
 * The right of the frame: the house line «قالیچه نفیس», and beneath it a card
 * about the piece on show, ending in the one white thing in the room — the buy
 * button. Every `data-line` is one unit of the change animation: when the rug
 * is turned, the lines turn with it.
 *
 * Persian words are never split into letters: the script is connected, and a
 * letter-level stagger would break the joins.
 *
 * On a phone the card sits above the dial, tighter: the description runs on
 * as two lines, and material and size become two small beads of glass.
 */
export function Story({ rug, inCart, onBuy }: StoryProps) {
  return (
    <div className={styles.story} data-el="story">
      <h1 className={styles.title} dir="rtl" lang="fa">
        <span className={styles.titleMask} data-el="title-mask" data-intro>
          <span className={styles.word} data-el="word">
            قالیچه
          </span>{' '}
          <span className={styles.word} data-el="word">
            نفیس
          </span>
        </span>
      </h1>

      <div className={styles.piece} data-el="piece" data-intro dir="rtl" lang="fa">
        <div aria-live="polite">
          <p className={styles.pieceMeta} data-line>
            <span className={styles.metaNum} lang="en" dir="ltr">
              {rug.index}
            </span>
            <i aria-hidden="true" />
            <span>{rug.fa.origin}</span>
          </p>
          <h2 className={styles.pieceTitle} data-line>
            {rug.fa.title}
          </h2>
          <p className={styles.pieceText}>
            {rug.fa.lines.map((line, i) => (
              <span key={i} data-line>
                {line}{' '}
              </span>
            ))}
          </p>
          <ul className={styles.specs}>
            {rug.fa.specs.map((spec, i) => (
              <li key={i} data-line>
                {spec}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.buyRow} data-line>
          <button type="button" className={styles.buy} data-ui data-added={inCart ? '1' : '0'} onClick={onBuy}>
            <svg viewBox="0 0 22 22" aria-hidden="true">
              {inCart ? (
                <path d="M5.5 11.5l3.6 3.6 7.4-8" />
              ) : (
                <>
                  <path d="M5.2 7.5h11.6l-.9 10.2a1.4 1.4 0 0 1-1.4 1.3H7.5a1.4 1.4 0 0 1-1.4-1.3L5.2 7.5z" />
                  <path d="M8.2 9.6V6.4a2.8 2.8 0 0 1 5.6 0v3.2" />
                </>
              )}
            </svg>
            <span>{inCart ? 'در سبد خرید' : 'خرید'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Lights off: the room is black and one line is typed into the middle of it.
 * The hidden ghost holds the finished width, so the text grows from its right
 * edge without the line re-centring on every keystroke.
 */
export function DarkTitle() {
  return (
    <div className={styles.dark} data-el="dark">
      <p className={styles.darkTitle} dir="rtl" lang="fa" aria-label={DARK_TITLE}>
        <span className={styles.darkGhost} aria-hidden="true">
          {DARK_TITLE}
        </span>
        <span className={styles.darkTyped} aria-hidden="true">
          <span data-el="typed" />
          <i className={styles.caret} />
        </span>
      </p>
      <p className={styles.darkHint} data-el="dark-hint" dir="rtl" lang="fa">
        برای روشن شدن، لمس کنید
      </p>
    </div>
  );
}
