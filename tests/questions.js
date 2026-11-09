// Questions a reader would really ask, with a phrase the answer must contain and the page it is on.
export const GOOD = [
  ['How long does it take to make a starter?', 'about seven days', 1],
  ['What temperature should the starter be kept at?', 'between 24 and 27 degrees Celsius', 1],
  ['What does a hungry starter smell like?', 'nail polish', 1],
  ['How much water is in the basic recipe?', '350 grams of water', 2],
  ['How much salt do I need?', '10 grams of salt', 2],
  ['Which flour gives a chewier loaf?', 'Bread flour', 2],
  ['How long is bulk fermentation?', '4 to 6 hours', 3],
  ['How long should I cold proof the dough?', '12 to 16 hours', 3],
  ['What is autolyse?', 'autolyse', 3],
  ['What temperature do I preheat the Dutch oven to?', '250 degrees Celsius for 45 minutes', 4],
  ['Why is my loaf dense?', 'starter was not active enough', 4],
  ['How long should bread cool before slicing?', 'at least one hour', 4],
  ['How should I store the loaf?', 'cut side down', 4],
  ['How do I freeze bread?', 'freeze it for up to three months', 4],
];

export const OFF_TOPIC = [
  'Who won the football world cup in 2018?',
  'What is the capital of France?',
  'How do I change a flat tire?',
  'How much does a loaf of bread cost in London?',
  'Explain quantum computing',
];

// Written after the answer engine was tuned, and never used to tune it: fresh wordings of
// things the guide does say. Classic search is not expected to get all of them.
export const HELD_OUT = [
  ['how many grams of starter do I add?', '100 grams', 2],
  ['what is the hydration of the dough?', '70 percent', 2],
  ['do I need a dutch oven?', 'Dutch oven', 2],
  ['how hot should the oven be?', '250', 4],
  ['what internal temperature means the bread is done?', '96', 4],
  ['why did my bread come out flat?', 'over-proofed', 4],
  ['can i use whole wheat flour?', 'Whole wheat', 2],
  ['how often should I feed the starter?', 'Every day', 1],
  ['when is the dough ready after bulk fermentation?', 'grown by about 50 percent', 3],
  ['what makes the crust pale?', 'pale crust', 4],
  ['how long can I freeze the bread?', 'three months', 4],
  ['what is a stretch and fold?', 'stretch and fold', 3],
];
