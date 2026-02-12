import { redirect } from 'next/navigation'

export default function LoginPage() {
  // Redirect to the actual auth login page
  redirect('/auth/login')
}