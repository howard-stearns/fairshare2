import { App, MDElement,  BasicApp, AppShare, CreateUser, MutableCollection, MenuButton, LiveList, AuthorizeUser } from '@kilroy-code/ui-components';
import { Rule } from '@kilroy-code/rules';

const { localStorage, URL } = window;


class User {
  constructor(properties) { Object.assign(this, properties); }
  isLiveRecord = true;
  get title() { return 'unknown'; }
  get picture() { return ''; }
  get groups() { return ['FairShare']; }
}
Rule.rulify(User.prototype);


class Group {
  constructor(properties) { Object.assign(this, properties); }
  isLiveRecord = true;
  get title() { return 'unknown'; }
  get picture() { return this.title.toLowerCase() + '.jpeg'; }
}
Rule.rulify(Group.prototype);



class FairshareApp extends BasicApp {
  get title() {
    return 'FairShare';
  }
  get group() {
    return this.getParameter('group') || this.groupCollection.liveTags[0] || '';
  }
  get payee() {
    return this.getParameter('payee');
  }
  get amount() {
    return parseFloat(this.getParameter('amount') || '0');
  }

  get userCollection() {
    return new MutableCollection({getRecord: getUserData, getLiveRecord: getUserModel});
  }
  get groupCollection() {
    return new MutableCollection({getRecord: getGroupData, getLiveRecord: getGroupModel});
  }
  // get liveGroupsEffect() {
  //   return this.setLocalLive('groupCollection');
  // }
  get userRecordEffect() { // When the record changes, update the live colleciton.
    return this.groupCollection.updateLiveTags(this.userRecord?.groups || []);
  }
  get liveUsersEffect() {
    return this.setLocalLive('userCollection');
  }
  setLocalLive(collectionName) {
    const currentData = this[collectionName].liveTags;
    return this.setLocal(collectionName, currentData);
  }
  getLocalLive(collectionName) {
    return this.getLocal(collectionName, []);
  }
  updateLiveFromLocal(collectionName) {
    let stored = this.getLocalLive(collectionName);
    return this[collectionName].updateLiveTags(stored);
  }
  setLocal(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  }
  getLocal(key, defaultValue = null) {
    const local = localStorage.getItem(key);
    return (local === null) ? defaultValue : JSON.parse(local);
  }
  get setUser() {
    return (tag, newData) => {
      if (!tag || !newData) return console.error('Please supply tag and newData to setUser');
      let oldRecord = this.userCollection[tag] || {},
	  data = {};
      // Essentially Object.assign({}, oldData, newData), but includes inherited oldData.
      for (const key in oldRecord) data[key] = oldRecord[key];
      for (const key in newData) data[key] = newData[key];
      return setUserData(tag, data);
    };
  }
  get setGroup() {
    return setGroupData;
  }

  get groupEffect() {
    return this.resetUrl({group: this.group});
  }
  constructor(...rest) {
    super(...rest);
    // SUBTLE
    // We want to read locally stored collection lists and allow them to be set from that, BEFORE
    // the default liveMumbleEffect rules fire during update (which fire on the initial empty values if not already set).
    // So we're doing that here, and relying on content not dependening on anything that would cause us to re-fire.
    // We will know the locally stored tags right away, which set initial liveTags and knownTags, and ensure that there is
    // a null record rule in the collection that will be updated when the data comes in.
    this.updateLiveFromLocal('userCollection');
  }
  afterInitialize() {
    super.afterInitialize();
    // When we get the list from the network, it will contain those initial knownTags members from above
    // (unless deleted on server!), and when it comes in, that will (re-)define the total knownTags order.
    getUserList().then(knownTags => this.userCollection.updateKnownTags(knownTags));
    getGroupList().then(knownTags => this.groupCollection.updateKnownTags(knownTags));
  }
}
FairshareApp.register();

export class FairshareCreateUser extends CreateUser {
}
FairshareCreateUser.register();

class FairshareGroupsMenuButton  extends MenuButton {
  get collection() {
    return App.groupCollection;
  }
  get tags() {
    return this.collection.liveTags;
  }
  get choice() {
    return App.group;
  }
  get groupEffect() {
    const group = this.choice,
	  model = group && this.collection[group],
	  title = model?.title || 'Pick one';
    return this.button.textContent = title;
  }
  select(tag) {
    App.resetUrl({group: tag});
  }
}
FairshareGroupsMenuButton.register();

class FairshareAllOtherGroupsMenuButton extends FairshareGroupsMenuButton {
  get choice() {
    return '';
  }
  get tags() {
    let live = new Set(this.collection.liveTags);
    return this.collection.knownTags.filter(tag => !live.has(tag));
  }
}
FairshareAllOtherGroupsMenuButton.register();


class FairshareAmount extends MDElement {
  get template() {
    return `<md-outlined-text-field label="Amount" name="amount" type="number" min="0" step="0.01" placeholder="unspecified"></md-outlined-text-field>`;
  }
  get element() {
    return this.shadow$('md-outlined-text-field');
  }
  get amountEffect() {
    if (App.amount) this.element.value = App.amount;
    return true;
  }
  afterInitialize() {
    super.afterInitialize();
    this.element.addEventListener('change', event => event.target.reportValidity());
    this.element.addEventListener('input', event => event.target.checkValidity() && App.resetUrl({amount: event.target.value}));
  }
}
FairshareAmount.register();

class FairshareAuthorizeUser extends AuthorizeUser {
}
FairshareAuthorizeUser.register();

class FairshareGroups extends LiveList {
  static async join(tag) {
    const groups = [...App.userRecord.groups, tag];
    await App.setUser(App.user, {groups});
    App.userCollection.updateLiveRecord(App.user);
  }
  get collection() {
    return App.groupCollection;
  }
  get active() {
    return App.group;
  }
  select(tag) {
    App.resetUrl({group: tag});
  }
  afterInitialize() {
    super.afterInitialize();
    this.child$('md-filled-button').addEventListener('click', () => {
      const menu = this.child$('fairshare-all-other-groups-menu-button');
      if (!menu.choice) return App.dialog("Please <i>pick one</i> of the groups to join.");
      FairshareGroups.join(menu.choice);
      menu.choice = '';
      return true;
    });
  }
}
FairshareGroups.register();
  
class FairshareShare extends AppShare {
  get url() {
    return App.urlWith({user: '', payee: '', amount: '', screen: 'Groups'});
  }
  get description() {
    return `Come join ${App.user} in ${App.group}!`;
  }
  get picture() {
    return App.getPictureURL(App.groupCollection[App.group]?.picture);
  }
}
FairshareShare.register();

class FairsharePayme extends AppShare {
  get url() {
    return App.urlWith({user: '', payee: App.user, amount: App.amount || '', screen: 'Pay'});
  }
  get description() {
    return App.amount ?
      `Please pay ${App.amount} ${App.group} to ${App.user}.` :
      `Please pay ${App.group} to ${App.user}.`;
  }
  get picture() {
    return App.getPictureURL(App.userCollection[App.user]?.picture);
  }
}
FairsharePayme.register();

class FairsharePay extends MDElement {
  get template() {
    return `<p><i>Paying another user is not implemented yet, but see <a href="https://howard-stearns.github.io/FairShare/app.html?user=alice&groupFilter=&group=apples&payee=carol&amount=10&investment=-50&currency=fairshare#pay" target="fairshare-poc">proof of concept</a>.</i></p>`;
  }
}
FairsharePay.register();

class FairshareInvest extends MDElement {
  get template() {
    return `<p><i>Investing in a groups is not implemented yet, but see <a href="https://howard-stearns.github.io/FairShare/app.html?user=alice&groupFilter=&group=apples&payee=carol&amount=10&investment=-50&currency=fairshare#invest" target="fairshare-poc">proof of concept</a>.</i></p>`;
  }
}
FairshareInvest.register();

// Some data for populating the db, local or remote.
const users = window.users = {
  Alice: new User({title: 'Alice'}),
  //Azalia: new User({title: "Azelia"}),
  Bob: new User({title: 'Bob', picture: 'bob.png'}),
  Carol: new User({title: 'Carol'})
  };
//const users = {H: {title: 'H'}, 'howard.stearns': {title: 'howard.stearns'}};
const groups = window.groups = {
  Apples: new Group({title: 'Apples'}),
  Bananas: new Group({title: "Bananas"}),
  Coconuts: new Group({title: "Coconuts"}),
  FairShare: new Group({title: "FairShare", picture: "fairshare.webp"})
};

/*
// Local definitions
function getUserModel(key) { return Promise.resolve(users[key]); }
function getGroupModel(key) { return new Promise(resolve => setTimeout(() => resolve(groups[key]), 1000)); }

*/
// Networked definitions
function dataPath(collection, key) {
  return `/persist/${collection}/${key}.json`;
}
async function getData(collection, key) {
  const pathname = dataPath(collection, key);
  const response = await fetch(pathname);
  if (!response.ok) return null;
  const data = await response.json();
  return data;
}
async function setData(collection, key, data) {
  const path = dataPath(collection, key),
	response = await fetch(path, {
	  body: JSON.stringify(data),
	  method: 'POST',
	  headers: {"Content-Type": "application/json"}
	});
  if (!response.ok) {
    console.warn(`set ${collection} ${key}: ${response.statusText}`);
    return null;
  }
  const result = await response.json();
  return result;
}

async function getUserModel(key) {
  const data = await getData('user', key),
	model = new User(data);
  return model;
}
async function getGroupModel(key) {
  const data = await getData('group', key),
	model = new Group(data);
  return model;
}

function setUserData(key, data) {
  return setData('user', key, data);
}
function setGroupData(key, data) {
  return setData('group', key, data);
}
function getUserData(key) {
  return getData('user', key);
}
function getGroupData(key) {
  return getData('group', key);
}
function getUserList() {
  return getData('user', 'list');
}
function getGroupList() {
  return getData('group', 'list');
}

function getModelData(model) {
  let {title, picture} = model;
  return {title, picture};
}
function populateDb() {
  for (const key in users) {
    setUserData(key, getModelData(users[key]));
  }
  for (const key in groups) {
    setGroupData(key, getModelData(groups[key]));
  }
}
Object.assign(window, {getData, setData, getUserData, getGroupData, setUserData, setGroupData, getUserModel, getGroupModel, getModelData, populateDb, getUserList, getGroupList});
//*/
		   

// fixme: remove in favor of above
//document.querySelector('switch-user').getModel = getUserModel;
//document.querySelector('fairshare-groups').getModel = getGroupModel;

