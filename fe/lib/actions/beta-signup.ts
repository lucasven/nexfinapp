"use server"

import { getSupabaseServerClient } from "@/lib/supabase/server"
import { z } from "zod"

const emailSchema = z.string().email("Invalid email address")

export type BetaSignupResult = 
  | { success: true; message: string }
  | { success: false; error: string }

export async function submitBetaSignup(email: string): Promise<BetaSignupResult> {
  try {
    // Validate email format
    const validationResult = emailSchema.safeParse(email)
    if (!validationResult.success) {
      return {
        success: false,
        error: "Por favor, forneça um endereço de e-mail válido.",
      }
    }

    const supabase = await getSupabaseServerClient()

    // Check if email already exists
    const { data: existingSignup, error: checkError } = await supabase
      .from("beta_signups")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .single()

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 = no rows returned (which is good, means email doesn't exist)
      console.error("Error checking existing signup:", checkError)
      return {
        success: false,
        error: "Ocorreu um erro ao processar sua solicitação. Tente novamente.",
      }
    }

    if (existingSignup) {
      return {
        success: false,
        error: "Este e-mail já está na lista de espera!",
      }
    }

    // Insert new signup
    const { error: insertError } = await supabase
      .from("beta_signups")
      .insert({
        email: email.toLowerCase().trim(),
        status: "pending",
      })

    if (insertError) {
      console.error("Error inserting beta signup:", insertError)
      
      // Handle duplicate email error (in case of race condition)
      if (insertError.code === "23505") {
        return {
          success: false,
          error: "Este e-mail já está na lista de espera!",
        }
      }

      return {
        success: false,
        error: "Ocorreu um erro ao processar sua solicitação. Tente novamente.",
      }
    }

    return {
      success: true,
      message: "Inscrição realizada com sucesso! Você receberá um e-mail quando a beta estiver disponível.",
    }
  } catch (error) {
    console.error("Unexpected error in submitBetaSignup:", error)
    return {
      success: false,
      error: "Ocorreu um erro inesperado. Tente novamente mais tarde.",
    }
  }
}
