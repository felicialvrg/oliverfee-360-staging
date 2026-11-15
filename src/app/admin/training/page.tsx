import {requireOwner} from '@/lib/admin/owner';
import {trainingData} from '@/lib/training/server';
import {TrainingCenter} from '@/components/training-center';
export const dynamic='force-dynamic';
export default async function Training(){await requireOwner();try{return <TrainingCenter data={await trainingData()}/>;}catch{return <main><h1>Training Center</h1><p>Owner-approved Lesson 1 is preserved. Private delivery remains disabled until private storage and permissions are verified.</p></main>;}}
