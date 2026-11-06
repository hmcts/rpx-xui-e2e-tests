const text = () => ({type:'text',fields:{keyword:{type:'keyword',ignore_above:256,normalizer:'lowercase_normalizer'}}});
const disabled = () => ({type:'object',enabled:false});
function observed(variant='baseline',index='harnessnestedprl_cases-000001') {
 const searchable=variant==='searchable';
 return {alias:{[index]:{aliases:{harnessnestedprl_cases:{is_write_index:true}}}},mapping:{[index]:{mappings:{properties:{
  data:{properties:{protectedValue:text(),sodAdditionalRecipientsList:disabled(),harnessEmailTypeProbe:{properties:{emailAddress:searchable?text():disabled()}}}},
  data_classification:{properties:{protectedValue:{type:'keyword'},sodAdditionalRecipientsList:disabled(),harnessEmailTypeProbe:{properties:{classification:{type:'keyword'},value:{properties:{emailAddress:searchable?{type:'keyword'}:disabled()}}}}}}
 }}}}};
}
module.exports={observed};
