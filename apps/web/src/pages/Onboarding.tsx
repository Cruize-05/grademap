import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap } from "lucide-react";
import { api } from "../lib/api.ts";
import { useAuth } from "../hooks/useAuth.ts";

interface ApiInstitution {
  id: string;
  code: string;
  name: string;
  email_domain: string;
}

const schema = z.object({
  institutionCode: z.string().min(2, "Pick an institution"),
  programme: z.string().min(2, "Enter your programme of study"),
  level: z.coerce.number().int().min(1).max(7),
});

type FormData = z.infer<typeof schema>;

export default function Onboarding() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: institutions, isLoading: instLoading } = useQuery({
    queryKey: ["institutions"],
    queryFn: () => api.get<ApiInstitution[]>("/api/institutions"),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { level: 1 } });

  async function onSubmit(values: FormData) {
    try {
      await api.post("/api/me", values);
      await qc.invalidateQueries({ queryKey: ["profile"] });
      navigate("/dashboard");
    } catch (err) {
      setError("root", { message: (err as Error).message });
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="bg-white border border-border rounded-2xl p-8 max-w-md w-full space-y-6">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 rounded-xl p-3">
            <GraduationCap size={24} className="text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-xl text-primary">Welcome to GradeMap UB</h1>
            <p className="text-sm text-gray-500">Tell us about your studies.</p>
          </div>
        </div>

        {user?.email && (
          <p className="text-xs text-gray-500 -mt-2">
            Signed in as <span className="font-mono">{user.email}</span> ·{" "}
            <button onClick={signOut} className="underline text-primary">
              switch account
            </button>
          </p>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1">
            <label htmlFor="institutionCode" className="text-sm font-medium text-gray-700">
              Institution
            </label>
            <select
              id="institutionCode"
              {...register("institutionCode")}
              aria-invalid={errors.institutionCode ? "true" : "false"}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary aria-[invalid=true]:border-danger"
            >
              <option value="">{instLoading ? "Loading…" : "Select your university"}</option>
              {institutions?.map((i) => (
                <option key={i.id} value={i.code}>
                  {i.name}
                </option>
              ))}
            </select>
            {errors.institutionCode && (
              <p role="alert" className="text-xs text-danger">
                {errors.institutionCode.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="programme" className="text-sm font-medium text-gray-700">
              Programme
            </label>
            <input
              id="programme"
              type="text"
              placeholder="e.g. Computer Science"
              {...register("programme")}
              aria-invalid={errors.programme ? "true" : "false"}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary aria-[invalid=true]:border-danger"
            />
            {errors.programme && (
              <p role="alert" className="text-xs text-danger">
                {errors.programme.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="level" className="text-sm font-medium text-gray-700">
              Year of study
            </label>
            <select
              id="level"
              {...register("level")}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  Year {n}
                </option>
              ))}
            </select>
          </div>

          {errors.root?.message && (
            <p role="alert" className="text-sm text-danger bg-danger/5 rounded-lg px-3 py-2">
              {errors.root.message}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || instLoading}
            className="w-full bg-primary text-white font-semibold py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {isSubmitting ? "Saving…" : "Continue to dashboard"}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center">
          You can update these details later. To submit grades you'll need to verify your
          institutional email.
        </p>
      </div>
    </div>
  );
}
