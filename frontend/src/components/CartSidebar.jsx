import { X, Minus, Plus, Trash2, Heart, ShoppingCart, AlertCircle, Gift, Tag } from 'lucide-react';

// WhatsApp Icon Component
const WhatsAppIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

export default function CartSidebar({ 
  isOpen, onClose, activeTab, setActiveTab,
  cart, wishlist, cartTotal, cartCount,
  updateQuantity, removeFromCart, clearCart,
  addToCart, removeFromWishlist, whatsappNumber,
  availableItems = []
}) {
  // Check if item is available (has itemStatus === 'available')
  const isItemAvailable = (itemId) => {
    const item = availableItems.find(item => item._id === itemId);
    return item && item.itemStatus === 'available';
  };

  // Get item status for display
  const getItemStatus = (itemId) => {
    const item = availableItems.find(item => item._id === itemId);
    return item?.itemStatus || 'unavailable';
  };

  // Get available cart items only
  const availableCartItems = cart.filter(item => isItemAvailable(item._id));
  const unavailableCartItems = cart.filter(item => !isItemAvailable(item._id));
  const availableCartTotal = availableCartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const hasUnavailableItems = unavailableCartItems.length > 0;

  // Check if wishlist item is available
  const unavailableWishlistItems = wishlist.filter(item => !isItemAvailable(item._id));
  const hasUnavailableWishlistItems = unavailableWishlistItems.length > 0;

  // Check if any cart items have offer info
  const hasOfferItems = cart.some(item => item.offerInfo);
  const offerIds = [...new Set(cart.filter(item => item.offerInfo).map(item => item.offerInfo.offerId))];

  // Generate WhatsApp message for available cart items only
  const generateWhatsAppMessage = () => {
    if (availableCartItems.length === 0) return '';
    let msg = '🛒 *Order from Website*\n\n';
    availableCartItems.forEach((item, i) => {
      msg += `${i + 1}. ${item.name} x${item.quantity} - ₹${item.price * item.quantity}`;
      if (item.offerInfo) {
        msg += ` 🎁`;
      }
      msg += `\n`;
    });
    msg += `\n💰 *Total: ₹${availableCartTotal}*`;
    
    // Include offer IDs for validation
    if (hasOfferItems) {
      msg += `\n\n🎁 *Offer Applied:*`;
      offerIds.forEach(offerId => {
        const offerItem = cart.find(item => item.offerInfo?.offerId === offerId);
        if (offerItem?.offerInfo) {
          msg += `\n• ${offerItem.offerInfo.title || offerItem.offerInfo.offerType} (ID: ${offerId})`;
        }
      });
    }
    
    msg += `\n\nPlease confirm my order!`;
    return encodeURIComponent(msg);
  };

  const handleOrderAll = () => {
    if (availableCartItems.length === 0) return;
    const msg = generateWhatsAppMessage();
    window.open(`https://wa.me/${whatsappNumber}?text=${msg}`, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-lenis-prevent>
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative w-full max-w-md bg-white h-full shadow-xl flex flex-col animate-slide-in" data-lenis-prevent>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('cart')}
              className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${activeTab === 'cart' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              <ShoppingCart className="w-4 h-4" />
              Cart {cartCount > 0 && `(${cartCount})`}
            </button>
            <button
              onClick={() => setActiveTab('wishlist')}
              className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${activeTab === 'wishlist' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              <Heart className="w-4 h-4" />
              Wishlist {wishlist.length > 0 && `(${wishlist.length})`}
            </button>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div 
          className="flex-1 overflow-y-auto p-4 scrollbar-cart" 
          style={{ maxHeight: 'calc(100vh - 220px)', overscrollBehavior: 'contain', touchAction: 'pan-y' }}
          data-lenis-prevent
        >
          {activeTab === 'cart' ? (
            cart.length === 0 ? (
              <div className="text-center py-12">
                <ShoppingCart className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Your cart is empty</p>
                <p className="text-sm text-gray-400 mt-1">Add items to get started!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Unavailable items warning */}
                {hasUnavailableItems && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-700">Some items are unavailable</p>
                      <p className="text-xs text-red-600 mt-1">These items won't be included in your order</p>
                    </div>
                  </div>
                )}

                {/* Available items */}
                {availableCartItems.map(item => (
                  <div key={item._id} className="flex gap-3 bg-gray-50 rounded-xl p-3">
                    <div className="relative">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-20 h-20 rounded-lg object-cover" />
                      ) : (
                        <div className="w-20 h-20 rounded-lg bg-gray-200 flex items-center justify-center">
                          <span className="text-2xl">🍽️</span>
                        </div>
                      )}
                      {/* Offer badge on image */}
                      {item.offerInfo && (
                        <div className="absolute -top-1 -right-1 bg-purple-600 text-white p-1 rounded-full">
                          <Gift className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{item.name}</h4>
                      <p className="text-sm text-gray-500">{item.quantity || 1} {item.unit}</p>
                      {/* Show offer info if present */}
                      {item.offerInfo && (
                        <p className="text-xs text-purple-600 flex items-center gap-1 mt-0.5">
                          <Tag className="w-3 h-3" />
                          {item.offerInfo.offerType || item.offerInfo.title}
                        </p>
                      )}
                      {/* Price display with original price strikethrough for discounted items */}
                      <div className="flex items-center gap-2">
                        {item.originalPrice && item.originalPrice > item.price ? (
                          <>
                            <p className="text-gray-400 line-through text-sm">₹{item.originalPrice * item.quantity}</p>
                            <p className="text-orange-600 font-semibold">₹{item.price * item.quantity}</p>
                          </>
                        ) : (
                          <p className="text-orange-600 font-semibold">₹{item.price * item.quantity}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <button onClick={() => updateQuantity(item._id, item.quantity - 1)} className="p-1 bg-white rounded-full shadow hover:bg-gray-50">
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-medium">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item._id, item.quantity + 1)} className="p-1 bg-white rounded-full shadow hover:bg-gray-50">
                          <Plus className="w-4 h-4" />
                        </button>
                        <button onClick={() => removeFromCart(item._id)} className="ml-auto p-1 text-red-500 hover:bg-red-50 rounded-full">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Unavailable items */}
                {unavailableCartItems.length > 0 && (
                  <>
                    <div className="border-t pt-4 mt-4">
                      <p className="text-sm font-medium text-gray-500 mb-3">Unavailable Items</p>
                    </div>
                    {unavailableCartItems.map(item => {
                      const status = getItemStatus(item._id);
                      const isSoldOut = status === 'soldout';
                      return (
                      <div key={item._id} className="flex gap-3 bg-gray-100 rounded-xl p-3 opacity-60">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="w-20 h-20 rounded-lg object-cover grayscale" />
                        ) : (
                          <div className="w-20 h-20 rounded-lg bg-gray-200 flex items-center justify-center">
                            <span className="text-2xl">🍽️</span>
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-gray-600">{item.name}</h4>
                            <span className={`px-2 py-0.5 text-xs rounded-full ${isSoldOut ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-600'}`}>
                              {isSoldOut ? 'Sold Out' : 'Unavailable'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-400">{item.quantity || 1} {item.unit}</p>
                          <p className="text-gray-400 line-through">₹{item.price * item.quantity}</p>
                          <button onClick={() => removeFromCart(item._id)} className="mt-2 px-3 py-1 bg-red-100 text-red-600 text-sm rounded-lg hover:bg-red-200">
                            Remove
                          </button>
                        </div>
                      </div>
                    );})}
                  </>
                )}
              </div>
            )
          ) : (
            wishlist.length === 0 ? (
              <div className="text-center py-12">
                <Heart className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Your wishlist is empty</p>
                <p className="text-sm text-gray-400 mt-1">Save items you love!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Unavailable wishlist items warning */}
                {hasUnavailableWishlistItems && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-700">Some items are currently unavailable</p>
                    </div>
                  </div>
                )}

                {wishlist.map(item => {
                  const available = isItemAvailable(item._id);
                  const status = getItemStatus(item._id);
                  const isSoldOut = status === 'soldout';
                  return (
                    <div key={item._id} className={`flex gap-3 rounded-xl p-3 ${available ? 'bg-gray-50' : 'bg-gray-100 opacity-60'}`}>
                      <div className="relative">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className={`w-20 h-20 rounded-lg object-cover ${!available ? 'grayscale' : ''}`} />
                        ) : (
                          <div className="w-20 h-20 rounded-lg bg-gray-200 flex items-center justify-center">
                            <span className="text-2xl">🍽️</span>
                          </div>
                        )}
                        {/* Offer badge on image */}
                        {item.offerInfo && (
                          <div className="absolute -top-1 -right-1 bg-purple-600 text-white p-1 rounded-full">
                            <Gift className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className={`font-medium ${available ? 'text-gray-900' : 'text-gray-600'}`}>{item.name}</h4>
                          {!available && (
                            <span className={`px-2 py-0.5 text-xs rounded-full ${isSoldOut ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-600'}`}>
                              {isSoldOut ? 'Sold Out' : 'Unavailable'}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{item.quantity || 1} {item.unit}</p>
                        {/* Show offer info if present */}
                        {item.offerInfo && (
                          <p className="text-xs text-purple-600 flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            {item.offerInfo.offerType || item.offerInfo.title}
                          </p>
                        )}
                        {/* Price display with original price strikethrough for discounted items */}
                        <div className="flex items-center gap-2">
                          {item.originalPrice && item.originalPrice > item.price ? (
                            <>
                              <p className={available ? 'text-gray-400 line-through text-sm' : 'text-gray-400 line-through text-sm'}>₹{item.originalPrice}</p>
                              <p className={available ? 'text-orange-600 font-semibold' : 'text-gray-400'}>₹{item.price}</p>
                            </>
                          ) : (
                            <p className={available ? 'text-orange-600 font-semibold' : 'text-gray-400'}>₹{item.price}</p>
                          )}
                        </div>
                        <div className="flex gap-2 mt-2">
                          {available ? (
                            <button onClick={() => { addToCart(item, 1, item.offerInfo); removeFromWishlist(item._id); }} className="px-3 py-1 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600">
                              Add to Cart
                            </button>
                          ) : (
                            <span className={`px-3 py-1 text-sm rounded-lg cursor-not-allowed ${isSoldOut ? 'bg-red-100 text-red-500' : 'bg-gray-200 text-gray-500'}`}>
                              {isSoldOut ? 'Sold Out' : 'Unavailable'}
                            </span>
                          )}
                          <button onClick={() => removeFromWishlist(item._id)} className="p-1 text-red-500 hover:bg-red-50 rounded-full">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* Footer - Cart Only */}
        {activeTab === 'cart' && cart.length > 0 && (
          <div className="border-t p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Total</span>
              <div className="text-right">
                {hasUnavailableItems && cartTotal !== availableCartTotal && (
                  <span className="text-sm text-gray-400 line-through mr-2">₹{cartTotal}</span>
                )}
                <span className="text-xl font-bold text-gray-900">₹{availableCartTotal}</span>
              </div>
            </div>
            {availableCartItems.length > 0 ? (
              <button onClick={handleOrderAll} className="w-full py-3 bg-green-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-green-600 transition-colors">
                <WhatsAppIcon className="w-5 h-5" />
                Order via WhatsApp
              </button>
            ) : (
              <button disabled className="w-full py-3 bg-gray-300 text-gray-500 rounded-xl font-semibold flex items-center justify-center gap-2 cursor-not-allowed">
                <WhatsAppIcon className="w-5 h-5" />
                No available items
              </button>
            )}
            <button onClick={clearCart} className="w-full py-2 text-red-500 text-sm hover:bg-red-50 rounded-lg">
              Clear Cart
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
