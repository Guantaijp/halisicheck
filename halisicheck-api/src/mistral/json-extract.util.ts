/**
 * Pulls a JSON object out of a model response.
 *
 * JSON mode is not a guarantee in practice: models still wrap output in prose
 * or code fences often enough that a bare `JSON.parse` discards real answers.
 * Each strategy is tried in order of trustworthiness, and `null` means the
 * caller should degrade rather than guess.
 */
export function extractJson<T>(raw: string): T | null {
  const attempt = (candidate: string): T | null => {
    try {
      const parsed: unknown = JSON.parse(candidate);
      // A bare string or number is valid JSON but never a valid response here,
      // and letting one through would surface as a confusing downstream error.
      if (parsed === null || typeof parsed !== 'object') return null;
      return parsed as T;
    } catch {
      return null;
    }
  };

  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const direct = attempt(trimmed);
  if (direct !== null) return direct;

  // ```json … ``` or a bare ``` … ``` fence.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    const parsed = attempt(fenced[1].trim());
    if (parsed !== null) return parsed;
  }

  // Last resort: the outermost brace pair, for answers padded with prose.
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    const parsed = attempt(trimmed.slice(first, last + 1));
    if (parsed !== null) return parsed;
  }

  return null;
}

/** Message content is `string | ContentChunk[] | null` — normalise to text. */
export function flattenContent(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const text = content
      .map((chunk) =>
        typeof chunk === 'string'
          ? chunk
          : ((chunk as { text?: unknown }).text ?? ''),
      )
      .filter((part): part is string => typeof part === 'string')
      .join('');
    return text.length > 0 ? text : null;
  }
  return null;
}
