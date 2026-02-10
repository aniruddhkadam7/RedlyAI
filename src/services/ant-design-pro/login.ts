// @ts-ignore
/* eslint-disable */
import { request } from 'umi';

/** å‘é€éªŒè¯ç  POST /api/login/captcha */
export async function getFakeCaptcha(
  params: {
    // query
    /** æ‰‹æœºå· */
    phone?: string;
  },
  options?: { [key: string]: any },
) {
  return request<API.FakeCaptcha>('/api/login/captcha', {
    method: 'GET',
    params: {
      ...params,
    },
    ...(options || {}),
  });
}
