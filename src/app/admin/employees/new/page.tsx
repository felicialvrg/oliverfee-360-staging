import {requireOwner} from '@/lib/admin/owner';
import {EmployeeInvite} from '@/components/sales/employee-invite';
import '../../../sales/sales.css';
export const dynamic='force-dynamic';
export default async function NewEmployee(){const owner=await requireOwner();return <EmployeeInvite preview={owner.id==='local-lab-owner'}/>;}
