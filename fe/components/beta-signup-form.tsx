"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { submitBetaSignup } from "@/lib/actions/beta-signup"
import { toast } from "sonner"
import { Loader2, Mail } from "lucide-react"

interface BetaSignupFormProps {
  variant?: "default" | "hero" | "cta"
  className?: string
}

export function BetaSignupForm({ variant = "default", className = "" }: BetaSignupFormProps) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email.trim()) {
      toast.error("Por favor, insira seu e-mail")
      return
    }

    setLoading(true)

    try {
      const result = await submitBetaSignup(email)
      
      if (result.success) {
        toast.success(result.message)
        setEmail("") // Clear the form
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      console.error("Error submitting beta signup:", error)
      toast.error("Ocorreu um erro inesperado. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  if (variant === "hero") {
    return (
      <form onSubmit={handleSubmit} className={`flex flex-col sm:flex-row gap-3 max-w-md ${className}`}>
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className="pl-10 h-12 text-base"
            required
          />
        </div>
        <Button 
          type="submit" 
          disabled={loading} 
          size="lg"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-12 px-8"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Enviando...
            </>
          ) : (
            "Entrar na Lista"
          )}
        </Button>
      </form>
    )
  }

  if (variant === "cta") {
    return (
      <form onSubmit={handleSubmit} className={`flex flex-col gap-4 max-w-lg mx-auto ${className}`}>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input
            type="email"
            placeholder="Digite seu melhor e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className="pl-10 h-14 text-lg"
            required
          />
        </div>
        <Button 
          type="submit" 
          disabled={loading}
          size="lg"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-14 text-lg"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-6 w-6 animate-spin" />
              Processando...
            </>
          ) : (
            "Garantir Meu Acesso Beta"
          )}
        </Button>
      </form>
    )
  }

  // Default variant
  return (
    <form onSubmit={handleSubmit} className={`flex gap-2 ${className}`}>
      <Input
        type="email"
        placeholder="seu@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={loading}
        className="flex-1"
        required
      />
      <Button 
        type="submit" 
        disabled={loading}
        className="bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          "Participar"
        )}
      </Button>
    </form>
  )
}
