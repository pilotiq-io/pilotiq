/**
 * Pure word/character-level diff used by the `lines` inline-diff mode to
 * highlight the *changed substrings* of a replaced line — GitHub-style
 * intra-line highlighting (issue #186).
 *
 * The `lines` LCS pass (in `InlineDiffExtension`) classifies whole blocks as
 * added / removed / kept. When a removed block is paired with a similar added
 * block (a replacement, e.g. an AI "fix grammar" edit), this module re-diffs
 * the two block texts at TOKEN granularity so only the actually-changed
 * characters get the deeper highlight tint. No DOM, no Tiptap — pure strings,
 * so it unit-tests in plain `node:test`.
 */

/** A half-open `[start, end)` char-offset range within a source string. */
export type CharRange = [number, number]

export interface WordDiffResult {
  /** Char ranges in `a` (the removed text) that changed. */
  aRanges: CharRange[]
  /** Char ranges in `b` (the added text) that changed. */
  bRanges: CharRange[]
  /**
   * Similarity in `0..1` — common-token chars over the longer string. Callers
   * gate on this so two *unrelated* replaced lines don't get noisy "everything
   * changed" highlighting; only genuine edits (high overlap) light up.
   */
  similarity: number
}

interface Tok { text: string; start: number }

/**
 * Tokenize into three classes — alphanumeric runs, whitespace runs, and
 * punctuation runs — each carrying its source offset. Splitting on these
 * boundaries means `"0.0.92"` tokenizes to `0 . 0 . 92`, so a `92`→`93` edit
 * highlights exactly `92` rather than the whole token.
 */
export function tokenizeForWordDiff(s: string): Tok[] {
  const toks: Tok[] = []
  const re = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]+/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) toks.push({ text: m[0], start: m.index })
  return toks
}

/** Collapse the not-kept tokens into merged char ranges, dropping ranges that
 *  are pure whitespace (a lone changed space reads as noise, not an edit). */
function mergedChangedRanges(toks: Tok[], keep: boolean[]): CharRange[] {
  const ranges: CharRange[] = []
  let cur: CharRange | null = null
  for (let k = 0; k < toks.length; k++) {
    const tok = toks[k]!
    if (keep[k]) { cur = null; continue }
    const start = tok.start
    const end   = start + tok.text.length
    if (cur && cur[1] === start) cur[1] = end          // contiguous → extend
    else { cur = [start, end]; ranges.push(cur) }
  }
  return ranges
}

/** True when every char in the range is whitespace (so it isn't worth a box). */
function isWhitespaceRange(src: string, [s, e]: CharRange): boolean {
  return src.slice(s, e).trim().length === 0
}

/**
 * Token-level LCS of two strings. Returns the changed char ranges on each side
 * plus a similarity score. Equal strings → no ranges, similarity 1.
 */
export function wordLevelDiff(a: string, b: string): WordDiffResult {
  const ta = tokenizeForWordDiff(a)
  const tb = tokenizeForWordDiff(b)
  const n = ta.length
  const m = tb.length

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (ta[i - 1]!.text === tb[j - 1]!.text) dp[i]![j] = dp[i - 1]![j - 1]! + 1
      else                                     dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
    }
  }

  const keepA = new Array<boolean>(n).fill(false)
  const keepB = new Array<boolean>(m).fill(false)
  let commonChars = 0
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    if (ta[i - 1]!.text === tb[j - 1]!.text) {
      keepA[i - 1] = true
      keepB[j - 1] = true
      commonChars += ta[i - 1]!.text.length
      i--
      j--
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) i--
    else j--
  }

  const aRanges = mergedChangedRanges(ta, keepA).filter(r => !isWhitespaceRange(a, r))
  const bRanges = mergedChangedRanges(tb, keepB).filter(r => !isWhitespaceRange(b, r))
  const longest = Math.max(a.length, b.length)
  const similarity = longest === 0 ? 1 : commonChars / longest

  return { aRanges, bRanges, similarity }
}
