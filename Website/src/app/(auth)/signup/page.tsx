import { AuthForm } from "@/features/auth/AuthForm";

type SignupPageProps = {
  searchParams?: Promise<{
    error?: string;
    message?: string;
    next?: string;
    verifyEmail?: string;
    setupEmail?: string;
    setupToken?: string;
  }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  return (
    <AuthForm
      mode="signup"
      error={params?.error}
      message={params?.message}
      next={params?.next}
      verifyEmail={params?.verifyEmail}
      setupEmail={params?.setupEmail}
      setupToken={params?.setupToken}
    />
  );
}
