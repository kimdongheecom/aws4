import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { authTestHelpers } from "@/features/auth/test/authServiceTest";
import { authService } from "@/services/authService";

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "dummy-client-id",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "dummy-client-secret",
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "아이디", type: "text" },
        password: { label: "비밀번호", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials) {
          console.log('인증 정보 없음');
          return null;
        }

        console.log('로그인 시도:', credentials.email);

        // 개발 환경에서는 테스트 헬퍼 사용
        if (process.env.NODE_ENV === 'development' && process.env.USE_MOCK_API === 'true') {
          return authTestHelpers.mockAuthorize(credentials);
        }

        try {
          // 실제 API 연동
          const response = await authService.login({
            email: credentials.email,
            password: credentials.password
          });

          if (!response.success) {
            throw new Error(response.message);
          }

          return {
            id: response.user_id || credentials.email,
            name: response.name || '사용자',
            email: credentials.email,
            role: response.role || 'user'
          };
        } catch (error) {
          console.error('API 로그인 오류:', error);
          return null;
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      if (account) {
        console.log('NextAuth JWT 콜백: 계정 정보로 토큰 업데이트');
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      
      // user 객체가 있으면 (첫 로그인 시) user 정보에서 역할 가져오기
      if (user) {
        console.log('JWT 콜백: 사용자 정보 확인', { id: user.id, email: user.email, role: user.role });
        
        // CredentialsProvider로 로그인한 경우 직접 설정된 role 사용
        if (user.role) {
          token.role = user.role;
          console.log('JWT 콜백: Credentials에서 역할 설정됨 -', user.role);
        }
        // Google 로그인 등 다른 Provider로 로그인한 경우
        else if (user.email) {
          if (user.email === 'admin' || user.email.includes('admin@')) {
            token.role = 'admin';
          } else if (user.email.includes('subscriber')) {
            token.role = 'subscriber';
          } else {
            token.role = 'user';
          }
          console.log('JWT 콜백: 이메일 기반 역할 설정됨 -', token.role);
        }
      }
      
      return token;
    },
    async session({ session, token }) {
      console.log('NextAuth 세션 콜백: 토큰 정보로 세션 업데이트');
      session.accessToken = token.accessToken as string;
      session.user.role = (token.role as 'user' | 'subscriber' | 'admin') || 'user';
      console.log('세션 콜백: 사용자 역할 -', session.user.role);
      return session;
    },
    async redirect({ url, baseUrl }) {
      console.log('NextAuth 리다이렉션 콜백:', { url, baseUrl });
      
      // 단순화된 리다이렉션 규칙:
      // 1. 외부 URL은 허용하지 않음
      // 2. 내부 URL은 그대로 사용
      // 3. 루트 URL은 그대로 사용 (후에 클라이언트에서 처리)
      
      // 외부 URL인 경우 홈으로 리다이렉션
      if (!url.startsWith(baseUrl)) {
        console.log('-> 외부 URL 차단, 홈으로 리다이렉션:', baseUrl);
        return baseUrl;
      }
      
      // 내부 URL은 그대로 유지 (역할 기반 리다이렉션은 클라이언트에서 처리)
      console.log('-> URL 유지:', url);
      return url;
    }
  },
  pages: {
    signIn: '/auth/login',
  },
  session: {
    strategy: "jwt" as const,
    maxAge: 30 * 24 * 60 * 60, // 30일
  },
  secret: process.env.NEXTAUTH_SECRET || "fallback-secret-key-for-development",
  debug: false, // 디버그 모드 비활성화
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };