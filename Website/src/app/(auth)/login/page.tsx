import { AuthForm } from "@/features/auth/AuthForm";

type LoginPageProps = {
  searchParams?: Promise<{ error?: string; message?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  return <AuthForm mode="login" error={params?.error} message={params?.message} next={params?.next} />;
}
