import { expect, test } from 'vitest'
import { qnaFailureMessage } from './errors'

test.each([[413, '사진 크기를'], [401, '로그인이 만료'], [403, '권한이 없습니다'], [404, '삭제되었거나'], [409, '다른 사용자가'], [429, '요청이 한꺼번에'], [503, '일시적인 서버 문제'], [504, '저장 여부'], [400, '입력한 내용']])('상태 %s는 사용자 사유로 안내한다', (status, text) => {
  const message = qnaFailureMessage({ status, message: 'SQL debug stack trace' })
  expect(message).toContain(text)
  expect(message).not.toContain('SQL')
})
test('예상하지 못한 예외와 응답 유실은 로그 대신 저장 여부 확인을 안내한다', () => {
  expect(qnaFailureMessage(new Error('secret'))).not.toContain('secret')
  expect(qnaFailureMessage({ code: 'INVALID_RESPONSE' })).toContain('중복 등록')
  expect(qnaFailureMessage({ code: 'VALIDATION_FAILED', message: '제목 값은 255자 이하여야 합니다.' })).toContain('255자')
})
