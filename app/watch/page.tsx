import { redirect } from 'next/navigation'

export default function WatchPage() {
  // Redirect to home if no params provided
  redirect('/')
}