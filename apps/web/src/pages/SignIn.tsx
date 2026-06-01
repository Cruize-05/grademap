import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "../lib/supabase.ts";

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
});

type FormData = z.infer<typeof schema>;

export default function SignIn() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit({ email }: FormData) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    if (!error) setSent(true);
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="bg-white border border-border rounded-2xl p-8 max-w-sm w-full text-center space-y-3">
          <p className="text-2xl">📬</p>
          <h2 className="font-bold text-lg text-gray-900">Check your email</h2>
          <p className="text-sm text-gray-500">
            We sent a magic link. Click it to sign in — no password needed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="bg-white border border-border rounded-2xl p-8 max-w-sm w-full space-y-6">
        <div className="space-y-1">
          <h1 className="font-bold text-xl text-primary">Sign in to GradeMap UB</h1>
          <p className="text-sm text-gray-500">We&apos;ll email you a magic link.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium text-gray-700">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@ub.cm"
              aria-invalid={errors.email ? "true" : "false"}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary aria-[invalid=true]:border-danger"
              {...register("email")}
            />
            {errors.email && (
              <p role="alert" className="text-xs text-danger">
                {errors.email.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary text-white font-semibold py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {isSubmitting ? "Sending…" : "Send magic link"}
          </button>
        </form>
      </div>
    </div>
  );
}
