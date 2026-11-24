import {requireSales} from '@/lib/sales/server';
import {trainingData} from '@/lib/training/server';
import {TrainingCenter} from '@/components/training-center';
export const dynamic='force-dynamic';
export default async function Training(){await requireSales();try{return <TrainingCenter data={await trainingData()}/>;}catch{return <main><h1>Training Center</h1><p>Your assigned training is not yet available. Contact the staging administrator.</p></main>;}}
