import { describe, expect, it } from 'vitest';

import { sanitizeGuideHtml } from './index';

/**
 * 가이드 문구는 외부 편집기에서 작성된 HTML 로 들어온다.
 * 앱은 이걸 HTML 로 렌더하지 않고, 스타일을 토큰으로 바꾼 뒤 태그를 전부 걷어내
 * <Text> 트리로 그린다. 즉 이 함수가 "HTML → 앱이 이해하는 텍스트"의 경계다.
 *
 * 아래는 전부 실제 동작을 고정한 것이다. 바람직해 보이지 않는 결과도
 * 실제로 그렇게 동작하기 때문에 그대로 적어 뒀다.
 */
describe('sanitizeGuideHtml', () => {
  describe('태그 제거', () => {
    it('스타일이 없는 태그는 흔적 없이 사라진다', () => {
      expect(sanitizeGuideHtml('<p>매장에 방문하세요</p>')).toBe('매장에 방문하세요');
    });

    it('<br> 은 줄바꿈이 된다', () => {
      expect(sanitizeGuideHtml('첫 줄<br>둘째 줄')).toBe('첫 줄\n둘째 줄');
      expect(sanitizeGuideHtml('첫 줄<br />둘째 줄')).toBe('첫 줄\n둘째 줄');
    });

    it('단락이 닫히면 줄바꿈이 된다', () => {
      expect(sanitizeGuideHtml('<p>하나</p><p>둘</p>')).toBe('하나\n둘');
    });

    it('알 수 없는 태그와 속성도 남기지 않는다', () => {
      expect(sanitizeGuideHtml('<table><tr><td onclick="x()">값</td></tr></table>')).toBe('값');
    });

    // 태그만 지우고 태그 사이의 글자는 남긴다. 결과물은 HTML 이 아니라 <Text> 로 들어가므로
    // 스크립트로 실행되지는 않지만, 광고주가 넣은 코드가 문구로 노출될 수는 있다.
    it('script 태그는 사라지되 안쪽 글자는 본문으로 남는다', () => {
      expect(sanitizeGuideHtml('<script>alert(1)</script>')).toBe('alert(1)');
    });
  });

  describe('HTML 엔티티', () => {
    it('자주 쓰는 엔티티를 되돌린다', () => {
      expect(sanitizeGuideHtml('A&nbsp;B')).toBe('A B');
      expect(sanitizeGuideHtml('&lt;주의&gt;')).toBe('<주의>');
      expect(sanitizeGuideHtml('&quot;리뷰&quot;')).toBe('"리뷰"');
      expect(sanitizeGuideHtml('&#39;별점&#39;')).toBe("'별점'");
      expect(sanitizeGuideHtml('커피&amp;디저트')).toBe('커피&디저트');
    });

    // &amp; 를 먼저 풀기 때문에 &amp;lt; 는 &lt; 를 거쳐 < 까지 풀린다.
    // 에디터가 이스케이프한 값을 그대로 보여주려면 이 순서를 바꿔야 한다.
    it('이중 인코딩된 값은 한 번 더 풀린다', () => {
      expect(sanitizeGuideHtml('&amp;lt;')).toBe('<');
    });
  });

  describe('스타일 → 토큰', () => {
    it('색상만 있으면 COLOR', () => {
      expect(sanitizeGuideHtml('<span style="color: #FF0000">필수</span>')).toBe(
        '{{COLOR:#FF0000:필수}}',
      );
    });

    it('굵기만 있으면 BOLD', () => {
      expect(sanitizeGuideHtml('<span style="font-weight: bold">필수</span>')).toBe(
        '{{BOLD:필수}}',
      );
    });

    it('크기만 있으면 SIZE (공백을 지우고 대문자로)', () => {
      expect(sanitizeGuideHtml('<span style="font-size: 14 pt">크게</span>')).toBe(
        '{{SIZE:14PT:크게}}',
      );
    });

    it('색상과 굵기가 같이 오면 BOLD_COLOR', () => {
      expect(
        sanitizeGuideHtml('<span style="color:#111;font-weight:bold">주의</span>'),
      ).toBe('{{BOLD_COLOR:#111:주의}}');
    });

    it('셋 다 오면 BOLD_COLOR_SIZE', () => {
      expect(
        sanitizeGuideHtml('<span style="color:#111;font-weight:bold;font-size:2em">주의</span>'),
      ).toBe('{{BOLD_COLOR_SIZE:#111:2EM:주의}}');
    });

    it('strong 은 style 이 없어도 굵게 본다', () => {
      expect(sanitizeGuideHtml('<strong>필수</strong>')).toBe('{{BOLD:필수}}');
      expect(sanitizeGuideHtml('<b>필수</b>')).toBe('{{BOLD:필수}}');
    });

    it('style 이 붙은 strong 은 색까지 살린다', () => {
      expect(sanitizeGuideHtml('<strong style="color:red">필수</strong>')).toBe(
        '{{BOLD_COLOR:red:필수}}',
      );
    });
  });

  describe('치환 토큰 보존', () => {
    // {{상품명}} 같은 치환 토큰은 뒤에서 실제 값으로 바뀐다.
    // 스타일 토큰으로 한 번 더 감싸면 파서의 non-greedy 정규식이 깨지므로 감싸지 않는다.
    it('치환 토큰이 들어간 구간은 스타일을 입히지 않고 그대로 둔다', () => {
      expect(sanitizeGuideHtml('<span style="color:red">{{상품명}}</span>')).toBe('{{상품명}}');
    });

    it('strong 안의 치환 토큰은 건드리지 않고 주변 글자만 굵게 한다', () => {
      expect(sanitizeGuideHtml('<strong>{{상품명}} 구매</strong>')).toBe('{{상품명}}{{BOLD: 구매}}');
    });
  });

  describe('입력이 비었을 때', () => {
    it.each([
      ['빈 문자열', '', ''],
      ['공백만', '   ', ''],
      ['태그만', '<p></p>', ''],
    ])('%s → 빈 문자열', (_label, input, expected) => {
      expect(sanitizeGuideHtml(input)).toBe(expected);
    });
  });
});
