/**
 * 스타일이 붙은 HTML 을 토큰 문자열로 바꾼다.
 *
 * 배경 ── 광고 가이드 문구를 외부 편집기에서 HTML 로 받아 모바일 앱에 그려야 했다.
 * 앱은 이걸 HTML 로 렌더하지 않는다. React Native 에는 innerHTML 이 없고,
 * 웹뷰를 띄우면 스크롤·폰트·터치가 앱과 따로 논다. 그래서 태그를 전부 걷어내고
 * 스타일만 토큰으로 남긴 뒤 <Text> 트리로 그린다.
 *
 * 입력이 우리 통제 밖이라는 게 핵심이다. 편집기가 무엇을 뱉을지 모르고,
 * 사람이 손으로 붙여넣은 마크업도 들어온다. 그래서 이 함수는
 *   - 모르는 태그가 와도 죽지 않고
 *   - {{치환토큰}} 은 건드리지 않으며
 *   - 어떤 입력이 와도 <Text> 가 받을 수 있는 문자열만 돌려준다.
 *
 * 실제 서비스에서 쓰던 코드를 그대로 떼어냈다. 동작을 바꾸지 않았고,
 * 테스트는 그 동작을 있는 그대로 고정한 것이다. 이상해 보이는 결과
 * (이중 인코딩이 한 번 더 풀린다든지)도 실제 동작이라 그대로 남겼다.
 */

export function sanitizeGuideHtml(html: string): string {
  const extractColor = (style: string) => {
    const colorMatch = style.match(/color:\s*([^;"]+)/i);
    return colorMatch ? colorMatch[1].trim() : null;
  };

  const extractBold = (style: string) => {
    return /font-weight:\s*bold/i.test(style);
  };

  const extractSize = (style: string) => {
    const sizeMatch = style.match(/font-size:\s*([^;"]+)/i);
    return sizeMatch ? sizeMatch[1].trim() : null;
  };

  const mapSize = (sizeVal: string | null) => {
    if (!sizeVal) return null;
    // 14pt -> 14PT, 1.5em -> 1.5EM
    return sizeVal.toUpperCase().replace(/\s+/g, '');
  };

  // 1. 스토어명, 상품명 등 특수 토큰 보존을 위해 먼저 처리
  let sanitized = html;

  // 2. 스타일이 있는 태그들 처리 (span, p, div 등)
  // 최대한 중첩된 태그들을 순차적으로 처리하기 위해 반복문을 사용하거나
  // 가장 안쪽 태그부터 처리되는 경향을 이용합니다.
  const styleTagRegex =
    /<(span|p|div|strong|b|em|i)[^>]*style\s*=\s*["']([^"']*)["'][^>]*>(.*?)<\/\1>/gi;

  // 스타일 추출 및 토큰화 처리기
  const processMatch = (
    match: string,
    tag: string,
    style: string,
    content: string,
  ) => {
    const color = extractColor(style);
    const isBold = extractBold(style) || tag === 'strong' || tag === 'b';
    const htmlSize = mapSize(extractSize(style));

    // If content contains {{...}} tokens (e.g. {{상품명}}), don't wrap them
    // in another token — nesting breaks the parser's non-greedy regex
    if (/\{\{[^{}]+\}\}/.test(content)) {
      return content;
    }

    if (color && isBold && htmlSize) {
      return `{{BOLD_COLOR_SIZE:${color}:${htmlSize}:${content}}}`;
    } else if (color && isBold) {
      return `{{BOLD_COLOR:${color}:${content}}}`;
    } else if (color && htmlSize) {
      return `{{COLOR_SIZE:${color}:${htmlSize}:${content}}}`;
    } else if (isBold && htmlSize) {
      return `{{BOLD_SIZE:${htmlSize}:${content}}}`;
    } else if (color) {
      return `{{COLOR:${color}:${content}}}`;
    } else if (isBold) {
      return `{{BOLD:${content}}}`;
    } else if (htmlSize) {
      return `{{SIZE:${htmlSize}:${content}}}`;
    }
    return content;
  };

  // 여러 번 적용하여 중첩된 스타일도 어느 정도 처리될 수 있게 함
  for (let i = 0; i < 3; i++) {
    const next = sanitized.replace(styleTagRegex, processMatch);
    if (next === sanitized) break;
    sanitized = next;
  }

  // 3. 스타일은 없지만 태그 자체가 볼드인 경우 처리
  sanitized = sanitized.replace(
    /<(strong|b)[^>]*>(.*?)<\/\1>/gi,
    (match, tag, content) => {
      return content
        .split(/(\{\{.*?\}\})/)
        .map((part: string) => {
          if (!part || (part.startsWith('{{') && part.endsWith('}}')))
            return part;
          return `{{BOLD:${part}}}`;
        })
        .join('');
    },
  );

  const result = sanitized
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>/gi, '\n') // 단락 구분은 줄바꿈으로
    .replace(/<[^>]+>/g, '') // 모든 태그 제거
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

  return result;
}
