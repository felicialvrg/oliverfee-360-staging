import SalesLogin from '@/components/sales/login-form';
export const dynamic='force-dynamic';
// The explicit login entry always requires the password form, even with a session.
// Private workspace guards continue to enforce the authenticated account's role.
export default function SalesLoginPage(){return <SalesLogin/>;}
