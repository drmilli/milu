import { redirect } from 'next/navigation';

export default function PhoneNumbersRedirect() {
  redirect('/admin/businesses');
}
